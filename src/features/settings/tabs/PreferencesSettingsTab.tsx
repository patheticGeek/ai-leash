import type { ReactNode } from "react";
import { Input } from "@/ui/input";
import { Label } from "@/ui/label";
import { useAppStore } from "../../../store";
import { DEFAULT_IDE_COMMAND } from "../../../store/ideSlice";
import ToggleRow from "./ToggleRow";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="text-sm font-medium uppercase tracking-wide text-zinc-500">
        {title}
      </div>
      {children}
    </section>
  );
}

export default function PreferencesSettingsTab() {
  const composeMode = useAppStore((s) => s.composeMode);
  const setComposeMode = useAppStore((s) => s.setComposeMode);
  const ideCommand = useAppStore((s) => s.ideCommand);
  const setIdeCommand = useAppStore((s) => s.setIdeCommand);
  const debugModeEnabled = useAppStore((s) => s.debugModeEnabled);
  const setDebugModeEnabled = useAppStore((s) => s.setDebugModeEnabled);
  const debugShowIds = useAppStore((s) => s.debugShowIds);
  const setDebugShowIds = useAppStore((s) => s.setDebugShowIds);

  return (
    <div className="flex h-full flex-col space-y-6">
      <Section title="Chat">
        <ToggleRow
          label="Compose mode"
          hint="Enter inserts a new line in the chat box, and Ctrl+Enter sends
            the message instead."
          checked={composeMode}
          onChange={setComposeMode}
        />
      </Section>
      <Section title="IDE">
        <div className="space-y-1.5 rounded-md bg-raised px-3 py-2.5">
          <Label htmlFor="ide-command" className="text-sm text-zinc-200">
            Command
          </Label>
          <Input
            id="ide-command"
            value={ideCommand}
            placeholder={DEFAULT_IDE_COMMAND}
            spellCheck={false}
            autoComplete="off"
            onChange={(e) => setIdeCommand(e.target.value)}
          />
          <span className="block text-xs text-zinc-600">
            Launched by the title bar's Open button with the current project or
            worktree folder added as the last argument. Use any command on your
            PATH, with optional flags, such as{" "}
            <code className="font-mono text-zinc-400">code</code>,{" "}
            <code className="font-mono text-zinc-400">zed</code>,{" "}
            <code className="font-mono text-zinc-400">cursor</code> or{" "}
            <code className="font-mono text-zinc-400">code -n</code>.
          </span>
        </div>
      </Section>
      <Section title="Debug">
        <ToggleRow
          label="Enable debug mode"
          hint="Adds a floating icon (bottom-right) that opens a live ACP Events
            panel — every request, response, notification, and error crossing
            every conversation's agent connection, app-wide. Nothing is
            persisted to disk; events are only kept in memory while this is on,
            and are dropped the moment it's turned off."
          checked={debugModeEnabled}
          onChange={setDebugModeEnabled}
        />
        <ToggleRow
          label="Show IDs in title bar"
          hint="Shows the current project, conversation, and ACP session id in
            the title bar's center section, as `project / conversation /
            session`."
          checked={debugShowIds}
          onChange={setDebugShowIds}
        />
      </Section>
    </div>
  );
}
