import { CodeXml } from "lucide-react";
import { useState } from "react";
import { Button } from "@/ui/button";
import { api } from "../lib/tauriApi";
import { useActiveCheckoutPath } from "../lib/useActiveCheckoutPath";
import { useAppStore } from "../store";

// Title-bar shortcut that opens the active conversation's checkout (primary
// root or worktree) in the IDE configured under Settings > IDE.
export default function OpenInIdeButton() {
  const checkoutPath = useActiveCheckoutPath();
  const ideCommand = useAppStore((s) => s.ideCommand);
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
      variant="chip"
      bordered={false}
      size="sm"
      onClick={handleClick}
      title={error ?? `Open in IDE (${ideCommand})`}
      className={error ? "text-warning" : undefined}
    >
      <CodeXml size={12} />
      <span>Open</span>
    </Button>
  );
}
