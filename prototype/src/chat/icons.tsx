// lucide (the app's icon pack) for the two git glyphs the checkout bar needs.
import type { SVGProps } from "react";
import { FolderGit2, GitBranch } from "lucide-react";

export function BranchIcon(props: SVGProps<SVGSVGElement>) {
  return <GitBranch {...props} />;
}

export function WorktreeIcon(props: SVGProps<SVGSVGElement>) {
  return <FolderGit2 {...props} />;
}
