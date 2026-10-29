// Erkundungslauf 4: Anmeldedaten der Seite mitschneiden, damit Nachbar-Termine laden,
// und die Kontrakt-Auswahl über dem Chart genau ansehen.
import { chromium } from "playwright";
import fs from "node:fs";

fs.mkdirSync("debug", { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ locale: "de-DE", viewport: { width: 1280, height: 1600 } });

let kopf = null;
const alle = [];
page.on("request", (req) => {
  if (req.url().includes("connect.kt-core.de/extern/ll/timeseries")) kopf = req.headers();
  if (req.url().includes("kt-core.de")) alle.push({ url: req.url(), headers: req.headers() });
});

await page.goto("https://www.kaack-terminhandel.de/eex/magermilchpulver", { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(3000);

// Nachbar-Termin (Nov 26) mit denselben Kopfzeilen laden
const ergebnis = {};
const BASIS = "https://connect.kt-core.de/extern/ll/timeseries";
for (const [k, url] of Object.entries({
  mmp_nov26: `${BASIS}?i=LX0004346785&basisIsin=LX0000639126&currency=eur&unit=t`,
  mmp_dez26: `${BASIS}?i=LX0004348112&basisIsin=LX0000639126&currency=eur&unit=t`,
})) {
  try {
    const r = await page.request.get(url, { headers: kopf || {} });
    const t = await r.text();
    let a = t.slice(0, 300);
    try { a = JSON.parse(t).timeseries.element.filter((e) => e.date >= "2026-09-10").map((e) => [e.date, e.settlement, e.last_price]); } catch {}
    ergebnis[k] = { status: r.status(), a };
  } catch (e) { ergebnis[k] = { fehler: String(e) }; }
}

// Kontrakt-Auswahl untersuchen
const auswahl = await page.evaluate(() => {
  const re = /^(Jan|Feb|Mär|Apr|Mai|Jun|Jul|Aug|Sep|Okt|Nov|Dez)\.? \d{2}$/;
  const el = [...document.querySelectorAll("*")].find((e) => e.children.length === 0 && re.test(e.textContent.trim()));
  if (!el) return null;
  let p = el; for (let i = 0; i < 5 && p.parentElement; i++) p = p.parentElement;
  return p.outerHTML.slice(0, 8000);
});

fs.writeFileSync("debug/probe-4.json", JSON.stringify({ kopfzeilen: kopf, anfragen: alle, ergebnis, auswahl }, null, 2));
await browser.close();
