import { FileCode, FileText, type LucideIcon } from "lucide-react";

// Extensions a file shows as code (FileCode) rather than text.
const CODE_EXTENSIONS = new Set([
  "ts",
  "tsx",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "py",
  "rs",
  "go",
  "java",
  "kt",
  "c",
  "h",
  "cc",
  "cpp",
  "hpp",
  "cs",
  "rb",
  "php",
  "swift",
  "sh",
  "bash",
  "zsh",
  "fish",
  "lua",
  "html",
  "css",
  "scss",
  "vue",
  "svelte",
  "json",
  "toml",
  "yaml",
  "yml",
  "xml",
  "sql",
]);

/** A file's icon: FileCode for a code file, FileText otherwise — what its
 * tab shows, and its row in the `@` file picker. */
export function fileIcon(path: string): LucideIcon {
  const name = path.split(/[\\/]/).pop() ?? "";
  const ext = name.includes(".") ? name.split(".").pop()?.toLowerCase() : "";
  return ext && CODE_EXTENSIONS.has(ext) ? FileCode : FileText;
}
