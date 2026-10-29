// Erkundungslauf 3: probiert, ob die Schnittstelle eine fortlaufende Reihe liefert,
// und lädt die Reihen der Nachbar-Termine zum Vergleich.
import fs from "node:fs";

const BASIS = "https://connect.kt-core.de/extern/ll/timeseries";
const HDR = { Referer: "https://www.kaack-terminhandel.de/", Origin: "https://www.kaack-terminhandel.de" };
const KANDIDATEN = {
  weizen_basis: `${BASIS}?i=LM3EBM0YFR07&basisIsin=LM3EBM0YFR07&currency=eur&unit=t`,
  weizen_basis_cont: `${BASIS}?i=LM3EBM0YFR07&basisIsin=LM3EBM0YFR07&currency=eur&unit=t&continuous=1`,
  mmp_basis: `${BASIS}?i=LX0000639126&basisIsin=LX0000639126&currency=eur&unit=t`,
  mmp_basis_cont: `${BASIS}?i=LX0000639126&basisIsin=LX0000639126&currency=eur&unit=t&continuous=1`,
  mmp_nov26: `${BASIS}?i=LX0004346785&basisIsin=LX0000639126&currency=eur&unit=t`,
};

fs.mkdirSync("debug", { recursive: true });
const out = {};
for (const [k, url] of Object.entries(KANDIDATEN)) {
  try {
    const r = await fetch(url, { headers: HDR });
    const t = await r.text();
    let auszug = t.slice(0, 600);
    try {
      const el = JSON.parse(t).timeseries.element;
      auszug = { anzahl: el.length, codes: [...new Set(el.map((e) => e.instrument_code))], ab2026_09: el.filter((e) => e.date >= "2026-09-10") };
    } catch {}
    out[k] = { status: r.status, auszug };
  } catch (e) {
    out[k] = { fehler: String(e) };
  }
}
fs.writeFileSync("debug/probe-3.json", JSON.stringify(out, null, 2));
