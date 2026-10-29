// Wöchentlicher Abruf der Mittwochs-Schlusskurse (Settlement) von den Kaack-Kursseiten.
// Öffnet die Seiten in einem echten Browser, liest die Terminliste und lädt die Kursreihe
// des jeweils gültigen Termins. Vorhandene Werte werden nie überschrieben.
import { chromium } from "playwright";
import fs from "node:fs";

const DATEI = "data/kurse.json";
const START = "2026-09-16"; // erster Stichtag (Mittwoch)

// Letzter Handelstag je Termin
const letzterMittwoch = (j, m) => { const d = new Date(Date.UTC(j, m, 0)); while (d.getUTCDay() !== 3) d.setUTCDate(d.getUTCDate() - 1); return d; };
const dritterMittwoch = (j, m) => { const d = new Date(Date.UTC(j, m - 1, 1)); let n = 0; for (;;) { if (d.getUTCDay() === 3 && ++n === 3) return d; d.setUTCDate(d.getUTCDate() + 1); } };
const zehnter = (j, m) => { const d = new Date(Date.UTC(j, m - 1, 10)); while ([0, 6].includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate() + 1); return d; };

const PRODUKTE = {
  weizen: {
    url: "https://www.kaack-terminhandel.de/euronext/weizen",
    verfall: (j, m) => zehnter(j, m),
  },
  mmp: {
    url: "https://www.kaack-terminhandel.de/eex/magermilchpulver",
    verfall: (j, m) => (m === 12 ? dritterMittwoch(j, m) : letzterMittwoch(j, m)),
  },
};

const iso = (d) => d.toISOString().slice(0, 10);
const tage = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
function isoKW(s) {
  const d = new Date(s + "T00:00:00Z");
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 4 - (d.getUTCDay() || 7)));
  return Math.ceil(((t - Date.UTC(t.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7);
}

const daten = JSON.parse(fs.readFileSync(DATEI, "utf8"));
const browser = await chromium.launch();
let neu = 0;

for (const [id, p] of Object.entries(PRODUKTE)) {
  const page = await browser.newPage({ locale: "de-DE" });
  let kopf = null, termine = null;
  page.on("request", (r) => { if (r.url().includes("/extern/ll/timeseries")) kopf = r.headers(); });
  page.on("response", async (r) => {
    if (!r.url().includes("/extern/ll/quotes")) return;
    try { termine = (await r.json()).quotes.element; } catch {}
  });
  await page.goto(p.url, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(3000);
  if (!kopf || !termine) throw new Error(`${id}: Kaack-Daten nicht geladen (Seite geändert?)`);

  // Termine mit Verfallstag, sortiert
  const liste = termine.map((t) => {
    const [j, m] = t.contract.split("-").map(Number);
    return { code: t.instrument_code, basis: t.base_instrument_code, kontrakt: t.contract, verfall: iso(p.verfall(j, m)) };
  }).sort((a, b) => a.verfall.localeCompare(b.verfall));
  const handelstag = termine.map((t) => t.trading_day).sort().pop();

  // Fällige Stichtage, die noch fehlen
  const reihe = daten.produkte[id].werte;
  const vorhanden = new Set(reihe.map((w) => w.datum));
  const faellig = [];
  for (let d = new Date(START + "T00:00:00Z"); iso(d) <= handelstag; d.setUTCDate(d.getUTCDate() + 7)) {
    if (!vorhanden.has(iso(d))) faellig.push(iso(d));
  }

  const cache = {};
  for (const tag of faellig) {
    // vorderster Termin, der mehr als 7 Tage nach dem Stichtag ausläuft
    const t = liste.find((x) => tage(tag, x.verfall) > 7);
    if (!t) { console.log(`${id} ${tag}: kein passender Termin`); continue; }
    if (!cache[t.code]) {
      const url = `https://connect.kt-core.de/extern/ll/timeseries?i=${t.code}&basisIsin=${t.basis}&currency=eur&unit=t`;
      const r = await page.request.get(url, { headers: kopf });
      if (!r.ok()) throw new Error(`${id}: Kursreihe ${t.kontrakt} nicht abrufbar (${r.status()})`);
      cache[t.code] = (await r.json()).timeseries.element;
    }
    const e = cache[t.code].find((x) => x.date === tag);
    if (!e || e.settlement == null) { console.log(`${id} ${tag}: noch kein Schlusskurs`); continue; }
    reihe.push({ kw: isoKW(tag), datum: tag, kurs: e.settlement, termin: t.kontrakt });
    neu++;
    console.log(`${id} ${tag}: ${e.settlement} (Termin ${t.kontrakt})`);
  }
  reihe.sort((a, b) => a.datum.localeCompare(b.datum));
  await page.close();
}

await browser.close();
if (neu) {
  const jetzt = new Date();
  daten.stand = jetzt.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" });
  fs.writeFileSync(DATEI, JSON.stringify(daten, null, 2) + "\n");
}
console.log(`Neue Werte: ${neu}`);
