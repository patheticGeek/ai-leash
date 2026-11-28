// Runs babel-plugin-react-compiler over src/ and lists every component or
// hook it skips. The app builds with `panicThreshold: "none"`, so a function
// the compiler can't compile is silently left unmemoized; this makes that
// loud. Exits 1 when anything was skipped.
//
//   node scripts/check-react-compiler.mjs [repo-root]   (npm run check:compiler)
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  process.argv[2] ??
    path.join(path.dirname(fileURLToPath(import.meta.url)), ".."),
);
const require = createRequire(path.join(root, "package.json"));
const babel = require("@babel/core");
const reactCompiler = require("babel-plugin-react-compiler");

const files = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!/themes|node_modules/.test(entry.name)) walk(p);
    } else if (
      /\.(tsx|ts)$/.test(entry.name) &&
      !/\.(test|stories|d)\.tsx?$/.test(entry.name) &&
      !/\.stylex\.ts$/.test(entry.name)
    ) {
      files.push(p);
    }
  }
})(path.join(root, "src"));

const REPORTED = [
  "CompileError",
  "CompileDiagnostic",
  "PipelineError",
  "CompileSkip",
];
const events = [];
for (const file of files) {
  const code = fs.readFileSync(file, "utf8");
  const rel = path.relative(root, file);
  try {
    babel.transformSync(code, {
      filename: file,
      babelrc: false,
      configFile: false,
      parserOpts: { plugins: ["typescript", "jsx"] },
      plugins: [
        [
          reactCompiler,
          {
            panicThreshold: "none",
            logger: {
              logEvent(_filename, ev) {
                if (ev.kind === "CompileSuccess") return;
                if (
                  ev.kind === "CompileSkip" &&
                  /no.*react/i.test(String(ev.reason))
                ) {
                  return;
                }
                if (!REPORTED.includes(ev.kind)) return;
                const d = ev.detail || {};
                const reason =
                  d.reason || d.options?.reason || ev.reason || ev.data || "";
                const loc = (d.loc || d.options?.details?.[0]?.loc || ev.fnLoc)
                  ?.start;
                events.push(
                  `${rel}:${loc?.line ?? "?"} ${ev.kind} ${String(reason).split("\n")[0]}`,
                );
              },
            },
          },
        ],
      ],
    });
  } catch (e) {
    events.push(`${rel} THROW ${String(e?.message ?? e).split("\n")[0]}`);
  }
}

console.log(events.length ? events.join("\n") : "no compiler bailouts");
console.error(`checked ${files.length} files`);
if (events.length) process.exitCode = 1;
