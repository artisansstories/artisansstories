// Playwright visual capture for Gate E. Starts assumes a dev/prod server already running on BASE.
// Usage: BASE=http://localhost:3000 node scripts/visual-shots.mjs <path1> <path2> ...
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = process.env.BASE || "http://localhost:3000";
const paths = process.argv.slice(2);
if (paths.length === 0) { paths.push("/", "/shop"); }
const outDir = ".playwright-baselines";
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
const page = await ctx.newPage();
const results = [];
for (const p of paths) {
  const url = BASE + p;
  const safe = p.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "root";
  try {
    const resp = await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(1200);
    const file = `${outDir}/${safe}.png`;
    await page.screenshot({ path: file, fullPage: true });
    results.push({ path: p, status: resp?.status() ?? 0, file });
    console.log(`SHOT ${p} -> ${file} (${resp?.status()})`);
  } catch (e) {
    results.push({ path: p, error: String(e).slice(0, 120) });
    console.log(`FAIL ${p} -> ${String(e).slice(0,120)}`);
  }
}
fs.writeFileSync(`${outDir}/results.json`, JSON.stringify(results, null, 2));
await browser.close();
console.log("VISUAL_SHOTS_DONE");
