import { Button } from "@astryxdesign/core/Button";
import { CodeXml } from "lucide-react";
import { useState } from "react";
import { usePreference } from "@/data/preferences";
import { api } from "../lib/tauriApi";
import { useActiveCheckoutPath } from "../lib/useActiveCheckoutPath";

// Title-bar shortcut that opens the active conversation's checkout (primary
// root or worktree) in the IDE configured under Settings > IDE.
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
      console.error("open in IDE failed:", e);
      setError(String(e));
    }
  }

  return (
    <Button
      variant="secondary"
      size="sm"
      label="Open"
      icon={<CodeXml size={12} />}
      onClick={handleClick}
      tooltip={error ?? `Open in IDE (${ideCommand})`}
    />
  );
}
