// Generates website/src/content/**/*.mdx from the repo's real docs
// (root README.md + docs/features/*.md) so the site has exactly one
// source of truth. Run automatically via predev/prebuild — nothing
// under src/content/ except the hand-maintained _meta.js files should
// ever be edited directly; it's all overwritten on every run.
import { readFileSync, writeFileSync, readdirSync, mkdirSync, copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const websiteDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoRoot = path.dirname(websiteDir);
const contentDir = path.join(websiteDir, "src", "content");

const GITHUB_BLOB_BASE = "https://github.com/patheticGeek/ai-leash/blob/master";

// MDX parses raw `<` as the start of a JSX tag and raw `{` as the start
// of a JS expression outside of code spans/fences — neither is intended
// in these docs (things like `Vec<PathBuf>` or `chat://{sessionId}/...`
// are always meant as plain text), so escape them there. Code spans and
// fences are left untouched since MDX already treats their contents as
// plain text, not JSX/expressions.
function escapeMdxOutsideCode(markdown) {
  // CommonMark code spans/fences are opened and closed by a run of N
  // backticks matched by an equal-length run later on — handles both
  // ```fenced blocks``` and `` spans with `` unusual `` delimiter counts ``
  // in one pass via the backreference, rather than assuming N is always 1 or 3.
  const codeRunRe = /(`+)[\s\S]*?\1/g;
  const escapeText = (text) => text.replaceAll("<", "&lt;").replaceAll("{", "&#123;");

  let result = "";
  let lastIndex = 0;
  for (const match of markdown.matchAll(codeRunRe)) {
    result += escapeText(markdown.slice(lastIndex, match.index));

    // Inline code spans get soft-wrapped across source lines for
    // readability in the .md source; CommonMark already renders an
    // embedded line ending in a code span as a single space, so joining
    // them here is a no-op for the rendered output. It's needed because a
    // literal newline left in means a wrapped `{`/`<` can land as the
    // first character of a "continuation" line — which trips up MDX's
    // list/blockquote container detection ("unexpected lazy line") even
    // though it's inside backticks. Fenced blocks (```-opened lines) are
    // left alone since their line breaks are meaningful.
    const lineStart = markdown.lastIndexOf("\n", match.index - 1) + 1;
    const isFenced = /^\s*$/.test(markdown.slice(lineStart, match.index));
    result += isFenced ? match[0] : match[0].replace(/\n[ \t]*/g, " ");
    lastIndex = match.index + match[0].length;
  }
  result += escapeText(markdown.slice(lastIndex));
  return result;
}

function rewriteReadmeLinks(markdown) {
  return markdown
    .replace(/\]\(\.\/docs\/features\/([\w-]+)\.md(#[\w-]*)?\)/g, "](/docs/features/$1$2)")
    .replace(/\]\(\.\/docs\/features\)/g, "](/docs/features)")
    .replace(/\]\(\.\/([^)]+)\)/g, `](${GITHUB_BLOB_BASE}/$1)`);
}

function rewriteFeatureDocLinks(markdown) {
  return markdown.replace(/\]\(\.\/([\w-]+)\.md(#[\w-]*)?\)/g, "](/docs/features/$1$2)");
}

function write(relPath, content) {
  const dest = path.join(contentDir, relPath);
  mkdirSync(path.dirname(dest), { recursive: true });
  writeFileSync(dest, content);
}

// Root README.md -> the site's home page.
const readme = readFileSync(path.join(repoRoot, "README.md"), "utf8");
write("index.mdx", escapeMdxOutsideCode(rewriteReadmeLinks(readme)));

// docs/features/README.md -> /docs/features (the section landing page).
const featuresDir = path.join(repoRoot, "docs", "features");
const featuresIndex = readFileSync(path.join(featuresDir, "README.md"), "utf8");
write(
  "docs/features/index.mdx",
  escapeMdxOutsideCode(rewriteFeatureDocLinks(featuresIndex)),
);

// Every other docs/features/*.md -> /docs/features/<name>.
for (const name of readdirSync(featuresDir)) {
  if (name === "README.md" || !name.endsWith(".md")) continue;
  const source = readFileSync(path.join(featuresDir, name), "utf8");
  const slug = name.replace(/\.md$/, "");
  write(`docs/features/${slug}.mdx`, escapeMdxOutsideCode(rewriteFeatureDocLinks(source)));
}

// App icon (public/logo.svg, the squircle "ai" + leash mark used to
// generate every src-tauri/icons/* variant) -> the site's favicon, via
// Next's app/icon.svg file convention. app/wordmark.svg (the "ai leash"
// text logo used in LeftBar.tsx/SettingsModal.tsx) -> the navbar logo.
// Copied rather than hand-duplicated so the site can't drift from what
// the app actually ships.
copyFileSync(path.join(repoRoot, "public", "logo.svg"), path.join(websiteDir, "src", "app", "icon.svg"));
mkdirSync(path.join(websiteDir, "public"), { recursive: true });
copyFileSync(
  path.join(repoRoot, "src", "assets", "logo.svg"),
  path.join(websiteDir, "public", "wordmark.svg"),
);

console.log("Synced docs into website/src/content/");
