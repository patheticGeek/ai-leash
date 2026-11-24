import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { CodeXml } from "lucide-react";
import { useState } from "react";
import { usePreference } from "@/data/preferences";
import { api } from "../lib/tauriApi";
import { useActiveCheckoutPath } from "../lib/useActiveCheckoutPath";

// Title-bar shortcut that opens the active conversation's checkout (primary
// root or worktree) in the external editor configured under Settings >
// External editor.
export default function OpenInIdeButton() {
  const checkoutPath = useActiveCheckoutPath();
  const ideCommand = usePreference("ideCommand");
  const [error, setError] = useState<string | null>(null);

  if (!checkoutPath) return null;

  async function handleClick() {
    if (!checkoutPath) return;
    try {
      await api.openInIde(ideCommand, checkoutPath);
      setError(null);
    } catch (e) {
      console.error("open in external editor failed:", e);
      setError(String(e));
    }
  }

  return (
    <IconButton
      variant="ghost"
      size="sm"
      label="Open in external editor"
      icon={<Icon icon={CodeXml} size="sm" />}
      onClick={handleClick}
      tooltip={error ?? `Open in external editor (${ideCommand})`}
    />
  );
}
