// Usage: node scripts/shoot.mjs <route> <out.png> [actions-json]
// Takes a 1400x900 screenshot of http://localhost:5199/#/<route>.
import { chromium } from "playwright";
const [route, out, actions] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
await page.goto(`http://localhost:5199/#/${route}`);
await page.waitForTimeout(1200);
for (const a of actions ? JSON.parse(actions) : []) {
  if (a.click) await page.click(a.click);
  if (a.type) await page.keyboard.type(a.type);
  if (a.press) await page.keyboard.press(a.press);
  if (a.scroll) await page.evaluate(([sel, x]) => { document.querySelector(sel).scrollLeft = x; }, a.scroll);
  if (a.wait) await page.waitForTimeout(a.wait);
}
await page.waitForTimeout(300);
await page.screenshot({ path: out });
if (errors.length) console.log("ERRORS", route, errors.slice(0, 5).join("\n"));
await browser.close();
