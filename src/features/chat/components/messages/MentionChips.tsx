import { HStack } from "@astryxdesign/core/Stack";
import { Token } from "@astryxdesign/core/Token";
import { FileText, Folder } from "lucide-react";
import { useActiveCheckoutPath } from "../../../../lib/useActiveCheckoutPath";
import { useAppStore } from "../../../../store";

// The files a sent message `@`-mentioned (`TextEntry.mentions`), as chips
// under its text. A file chip opens it in a tab; a folder (its path ends
// in "/") is just shown. Paths are relative to the chat's
// checkout, which is the one the file tree and tabs follow.
export default function MentionChips({ paths }: { paths: string[] }) {
  const checkoutPath = useActiveCheckoutPath();
  const openFile = useAppStore((s) => s.openFile);
  return (
    <HStack gap={1} wrap="wrap">
      {paths.map((path) => {
        const isDir = path.endsWith("/");
        const name = path.replace(/\/$/, "").split("/").pop() ?? path;
        return (
          <Token
            key={path}
            size="sm"
            label={path}
            icon={isDir ? <Folder size={12} /> : <FileText size={12} />}
            description={isDir ? "Mentioned folder" : "Open file"}
            onClick={
              checkoutPath && !isDir
                ? () => void openFile(`${checkoutPath}/${path}`, name)
                : undefined
            }
          />
        );
      })}
    </HStack>
  );
}
