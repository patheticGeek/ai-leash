// Heroicons (the Astryx templates' icon set) has no git glyphs, so the two
// the checkout bar needs come from lucide at heroicons' 1.5 stroke.
import type { SVGProps } from "react";
import { FolderGit2, GitBranch } from "lucide-react";

export function BranchIcon(props: SVGProps<SVGSVGElement>) {
  return <GitBranch strokeWidth={1.5} {...props} />;
}

export function WorktreeIcon(props: SVGProps<SVGSVGElement>) {
  return <FolderGit2 strokeWidth={1.5} {...props} />;
}
