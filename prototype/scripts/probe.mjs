import { chromium } from "playwright";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.goto(`http://localhost:5199/#/chat`);
await page.waitForTimeout(1200);
const r = await page.evaluate(() => {
  const fs = (el) => el && getComputedStyle(el).fontSize;
  const q = (sel, i = 0) => document.querySelectorAll(sel)[i];
  const byText = (t) => [...document.querySelectorAll("*")].find((e) => e.childElementCount === 0 && e.textContent.trim() === t);
  return {
    tab: fs(byText("Sub agents")), centerTab: fs(byText("Agent")), sideNavItem: fs(byText("Add project")),
    smButton: fs(byText("dev")), picker: fs(byText("High")), titleBarTitle: fs(byText("#42 Astryx: board on the kanban template")),
    toolName: fs(byText("grep")), systemMsg: fs(byText("Today")), tree: fs(byText("BoardView.tsx")), checkout: fs(byText("task-42")),
  };
});
console.log(r); await browser.close();
