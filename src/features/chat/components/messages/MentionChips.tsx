import { HStack } from "@astryxdesign/core/Stack";
import { Token } from "@astryxdesign/core/Token";
import { Tooltip } from "@astryxdesign/core/Tooltip";
import { spacingVars } from "@astryxdesign/core/theme/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { FileText, Folder } from "lucide-react";
import type { InlineMention } from "../../../../lib/mentions";
import { useActiveCheckoutPath } from "../../../../lib/useActiveCheckoutPath";
import { useAppStore } from "../../../../store";

const styles = stylex.create({
  // Sits in a line of message text (a review's `### 1. @path:12-18`
  // heading, say), centred on it rather than on its baseline.
  inline: { verticalAlign: "middle" },
  row: { marginBlockStart: spacingVars["--spacing-2"] },
});

function lineSuffix({ startLine, endLine }: InlineMention): string {
  if (startLine === undefined) return "";
  return startLine === endLine ? `:${startLine}` : `:${startLine}-${endLine}`;
}

// One mentioned file or folder (paths are relative to the chat's checkout,
// the one the file tree and tabs follow; a folder's ends in "/"): its name
// and lines, its full path in the tooltip. A file's opens it in a tab, at
// its lines when it has them; a folder's is just shown.
export function MentionToken({
  mention,
  isInline = false,
}: {
  mention: InlineMention;
  isInline?: boolean;
}) {
  const checkoutPath = useActiveCheckoutPath();
  const openFile = useAppStore((s) => s.openFile);
  const { path, startLine, endLine } = mention;
  const isDir = path.endsWith("/");
  const name = path.replace(/\/$/, "").split("/").pop() ?? path;
  const lines =
    startLine !== undefined && endLine !== undefined
      ? { startLine, endLine }
      : undefined;
  return (
    <Tooltip content={path} delay={400}>
      <Token
        size="sm"
        label={`${isDir ? `${name}/` : name}${lineSuffix(mention)}`}
        icon={isDir ? <Folder size={12} /> : <FileText size={12} />}
        description={isDir ? `Mentioned folder ${path}` : `Open ${path}`}
        onClick={
          checkoutPath && !isDir
            ? () => void openFile(`${checkoutPath}/${path}`, name, lines)
            : undefined
        }
        xstyle={isInline ? styles.inline : undefined}
      />
    </Tooltip>
  );
}

// The files a sent message `@`-mentioned (`TextEntry.mentions`) that its
// text doesn't show inline as a badge (`ChatEntryRenderer`), as chips
// under it — normally none.
export default function MentionChips({
  mentions,
}: {
  mentions: InlineMention[];
}) {
  return (
    <HStack gap={1} wrap="wrap" xstyle={styles.row}>
      {mentions.map((mention) => (
        <MentionToken key={mention.path} mention={mention} />
      ))}
    </HStack>
  );
}
