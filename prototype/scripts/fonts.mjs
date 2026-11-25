// Prints the computed font sizes of text on a route, grouped by size, so the
// text-size requirement (body >= 14px, chrome 12px) can be checked.
import { chromium } from "playwright";
const route = process.argv[2];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.goto(`http://localhost:5199/#/${route}`);
await page.waitForTimeout(1200);
const out = await page.evaluate(() => {
  const by = {};
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) {
    const t = n.textContent.trim();
    if (!t || !n.parentElement) continue;
    const r = n.parentElement.getBoundingClientRect();
    if (r.width === 0 || r.bottom < 0 || r.top > 900) continue;
    const fs = getComputedStyle(n.parentElement).fontSize;
    (by[fs] ??= []).push(t.slice(0, 28));
  }
  return by;
});
for (const [k, v] of Object.entries(out).sort((a, b) => parseFloat(a[0]) - parseFloat(b[0])))
  console.log(k.padEnd(8), v.length, "|", [...new Set(v)].slice(0, 14).join(" · "));
await browser.close();
