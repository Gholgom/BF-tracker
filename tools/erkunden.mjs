// Erkundungslauf 5: im Kontrakt-Auswahlfeld „Fortlaufend“ wählen und festhalten,
// welche Datenreihe die Seite dann lädt. Es werden keine Kopfzeilen gespeichert.
import { chromium } from "playwright";
import fs from "node:fs";

const SEITEN = {
  weizen: "https://www.kaack-terminhandel.de/euronext/weizen",
  mmp: "https://www.kaack-terminhandel.de/eex/magermilchpulver",
};
const STICHTAGE = ["2026-09-16", "2026-09-23", "2026-09-30", "2026-10-07", "2026-10-14", "2026-10-21", "2026-10-28"];

fs.mkdirSync("debug", { recursive: true });
const browser = await chromium.launch();
const out = {};

for (const [name, url] of Object.entries(SEITEN)) {
  const page = await browser.newPage({ locale: "de-DE", viewport: { width: 1280, height: 1600 } });
  const reihen = [];
  page.on("response", async (res) => {
    if (!res.url().includes("/extern/ll/timeseries")) return;
    try {
      const el = (await res.json()).timeseries.element;
      reihen.push({
        url: res.url(),
        codes: [...new Set(el.map((e) => e.instrument_code))],
        werte: el.filter((e) => STICHTAGE.includes(e.date)).map((e) => [e.date, e.instrument_code, e.settlement, e.last_price]),
      });
    } catch (e) { reihen.push({ url: res.url(), fehler: String(e) }); }
  });

  await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(3000);
  const vorher = reihen.length;
  const schritte = [];

  // Alle React-Select-Felder durchgehen; das Kontraktfeld hat einen Monatsnamen oder „Fortlaufend“ als Wert
  const felder = page.locator(".select-component");
  const n = await felder.count();
  schritte.push(`Auswahlfelder: ${n}`);
  for (let i = 0; i < n; i++) {
    const f = felder.nth(i);
    const wert = (await f.innerText()).trim();
    schritte.push(`Feld ${i}: ${wert.replace(/\s+/g, " ").slice(0, 40)}`);
    if (!/(Jan|Feb|Mär|Apr|Mai|Jun|Jul|Aug|Sep|Okt|Nov|Dez)\.? \d{2}|Fortlaufend/.test(wert)) continue;
    try {
      await f.scrollIntoViewIfNeeded();
      await f.click();
      await page.waitForTimeout(800);
      const optionen = await page.locator("[id^='react-select'][id*='-option-']").allInnerTexts();
      schritte.push("Optionen: " + optionen.join(" | ").slice(0, 400));
      const opt = page.locator("[id^='react-select'][id*='-option-']", { hasText: /fortlaufend/i }).first();
      await opt.click({ timeout: 5000 });
      schritte.push("Fortlaufend gewählt");
      await page.waitForTimeout(5000);
    } catch (e) { schritte.push("Fehler: " + e.message.slice(0, 200)); }
    break;
  }

  out[name] = { schritte, vorher, reihen };
  await page.close();
}

fs.writeFileSync("debug/probe-5.json", JSON.stringify(out, null, 2));
await browser.close();
