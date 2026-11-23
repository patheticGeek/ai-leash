// Usage: node scripts/shoot-all.mjs [outDir=shots-v2] [only-route-substring]
// Screenshots every prototype screen (and each raw template as ref-<name>)
// at 1400x900 from the dev server on http://localhost:5199.
import { chromium } from "playwright";

const [outDir = "shots-v2", only] = process.argv.slice(2);

// Scroll the board's sideways scroller to its far end.
const scrollBoard = async (page) =>
  page.evaluate(() => {
    const el = [...document.querySelectorAll("*")].find(
      (e) => e.scrollWidth > e.clientWidth + 40 && getComputedStyle(e).overflowX === "auto",
    );
    if (el) el.scrollLeft = el.scrollWidth;
  });
const typeSlash = async (page) => {
  await page.click("[contenteditable=true], textarea");
  await page.keyboard.type("/");
};

const typeInComposer = (text) => async (page) => {
  await page.click("[contenteditable=true], textarea");
  await page.keyboard.type(text);
};
const clickButton = (name) => async (page) => {
  await page.getByRole("button", { name }).first().click();
};
const hoverButton = (name) => async (page) => {
  await page.getByRole("button", { name }).first().hover();
  await page.waitForTimeout(900);
};
const hoverTab = (text) => async (page) => {
  await page.getByText(text, { exact: true }).first().hover();
};

// [route, action?, file name?]
const SHOTS = [
  ["chat"],
  ["chat-collapsed", null, "chat-sidebar-collapsed"],
  ["chat-subagent-tab", hoverTab("BoardView.tsx"), "chat-tabs-close"],
  ["chat-permission"],
  ["chat-question"],
  ["new"],
  ["new-slash", typeSlash],
  ["board"],
  ["board-epics"],
  ["board-epics-drag"],
  ["board-epics-scrolled", scrollBoard],
  // Chat states gallery (src/screens/ChatStatesScreen.tsx)
  ["strip-queued-1"],
  ["strip-queued-3"],
  ["strip-rate-limit"],
  ["strip-task-link"],
  ["strip-error-crash"],
  ["strip-error-connection"],
  ["popup-slash", typeInComposer("/")],
  ["popup-mention", typeInComposer("@board")],
  ["popup-model", clickButton("Claude Code · Opus 5.5")],
  ["popup-effort", clickButton("Effort: High")],
  ["popup-permission", clickButton("Permissions: Accept edits")],
  ["prompt-permission"],
  ["prompt-question"],
  ["toasts"],
  ["confirm-delete-conversation"],
  ["confirm-finish-task"],
  ["tooltip", hoverButton("Open in external editor")],
  ["state-empty"],
  ["state-loading"],
  ["state-error"],
  ["state-actions-empty"],
  ["state-actions-loading"],
  ["state-actions-error"],
  ["pill-subagents"],
  ["pill-subagents-open"],
  ["task"],
  ["task-new"],
  ["task-details"],
  ["task-details-todo"],
  ...["agents", "chat", "fonts", "editor", "debug", "crashlog", "about"].map((p) => [`settings/${p}`]),
  ...["ide", "shell-side-nav", "ai-chat-landing", "ai-chat", "kanban-board", "work-item-detail", "settings-dialog"].map(
    (t) => [`ref/${t}`],
  ),
];

const browser = await chromium.launch();
for (const [route, act, name] of SHOTS) {
  if (only && !route.includes(only)) continue;
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto(`http://localhost:5199/#/${route}`);
  await page.waitForTimeout(1000);
  if (act) await act(page);
  await page.waitForTimeout(400);
  const file = name ?? (route.startsWith("ref/") ? `ref-${route.slice(4)}` : route.replace("/", "-"));
  await page.screenshot({ path: `${outDir}/${file}.png` });
  if (errors.length) console.log("ERRORS", route, errors.slice(0, 3).join("\n"));
  await page.close();
}
await browser.close();
