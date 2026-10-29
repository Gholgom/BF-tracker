// Erkundungslauf: öffnet die Kaack-Kursseiten und speichert, woher der Chart seine Daten holt.
import { chromium } from "playwright";
import fs from "node:fs";

const SEITEN = {
  weizen: "https://www.kaack-terminhandel.de/euronext/weizen",
  mmp: "https://www.kaack-terminhandel.de/eex/magermilchpulver",
};

fs.mkdirSync("debug", { recursive: true });
const browser = await chromium.launch();

for (const [name, url] of Object.entries(SEITEN)) {
  const page = await browser.newPage({ locale: "de-DE", viewport: { width: 1280, height: 1600 } });
  const anfragen = [];
  page.on("response", async (res) => {
    const req = res.request();
    const typ = req.resourceType();
    if (!["xhr", "fetch", "script", "document"].includes(typ)) return;
    const eintrag = { url: res.url(), methode: req.method(), typ, status: res.status(), ctype: res.headers()["content-type"] || "", post: req.postData() || null };
    if (["xhr", "fetch"].includes(typ)) {
      try { eintrag.body = (await res.text()).slice(0, 4000); } catch { eintrag.body = null; }
    }
    anfragen.push(eintrag);
  });

  await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(4000);

  const auswahl = await page.$$eval("select", (els) => els.map((s) => ({
    name: s.name, id: s.id, klasse: s.className, wert: s.value,
    optionen: [...s.options].map((o) => ({ wert: o.value, text: o.textContent.trim() })).slice(0, 40),
  })));

  const charts = await page.evaluate(() => {
    const out = { highcharts: null, globals: [] };
    if (window.Highcharts && window.Highcharts.charts) {
      out.highcharts = window.Highcharts.charts.filter(Boolean).map((c) => c.series.map((s) => ({
        name: s.name, punkte: (s.options.data || []).length,
        letzte: (s.options.data || []).slice(-12),
      })));
    }
    for (const k of Object.keys(window)) {
      if (/chart|kurs|data|stock|amchart|echart|apex/i.test(k)) out.globals.push(k);
    }
    return out;
  });

  await page.screenshot({ path: `debug/${name}.png`, fullPage: false });
  fs.writeFileSync(`debug/${name}.json`, JSON.stringify({ url, auswahl, charts, anfragen }, null, 2));
  await page.close();
}

await browser.close();
