// Erkundungslauf 2: wählt im Kaack-Chart „Fortlaufend“ und speichert die Datenanfragen vollständig.
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
    if (!res.url().includes("kt-core.de")) return;
    let body = null;
    try { body = await res.text(); } catch {}
    anfragen.push({ zeit: Date.now(), url: res.url(), status: res.status(), body });
  });

  await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(3000);
  const vorher = anfragen.length;
  const schritte = [];

  // Kontrakt-Auswahl über dem Chart finden und auf „Fortlaufend“ stellen
  try {
    const knopf = page.getByText(/^(Jan|Feb|Mär|Apr|Mai|Jun|Jul|Aug|Sep|Okt|Nov|Dez)\.? \d{2}$/).first();
    await knopf.scrollIntoViewIfNeeded();
    await knopf.click({ timeout: 10000 });
    schritte.push("Auswahl geöffnet");
    await page.waitForTimeout(1000);
    await page.getByText("Fortlaufend", { exact: true }).first().click({ timeout: 10000 });
    schritte.push("Fortlaufend geklickt");
    await page.waitForTimeout(5000);
  } catch (e) {
    schritte.push("Fehler: " + e.message.slice(0, 300));
  }

  // Zusätzlich: HTML rund um die Auswahl sichern
  const html = await page.evaluate(() => {
    const el = [...document.querySelectorAll("*")].find((e) => e.children.length === 0 && /Fortlaufend/.test(e.textContent));
    let p = el; for (let i = 0; i < 4 && p && p.parentElement; i++) p = p.parentElement;
    return p ? p.outerHTML.slice(0, 6000) : null;
  });

  await page.screenshot({ path: `debug/${name}-2.png` });
  fs.writeFileSync(`debug/${name}-2.json`, JSON.stringify({ url, schritte, neueAnfragenAb: vorher, html, anfragen }, null, 2));
  await page.close();
}

await browser.close();
