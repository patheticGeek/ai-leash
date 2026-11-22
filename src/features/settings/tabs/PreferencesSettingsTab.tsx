import { NumberInput } from "@astryxdesign/core/NumberInput";
import { TextInput } from "@astryxdesign/core/TextInput";
import type { ReactNode } from "react";
import {
  COMPOSER_MIN_ROWS,
  DEFAULT_CODE_FONT_SIZE,
  DEFAULT_COMPOSER_MAX_ROWS,
  DEFAULT_IDE_COMMAND,
  DEFAULT_UI_FONT_SIZE,
  MAX_COMPOSER_MAX_ROWS,
  MAX_FONT_SIZE,
  MIN_FONT_SIZE,
  usePreference,
  useSetPreferences,
} from "../../../data/preferences";
import FontFamilyPicker from "./FontFamilyPicker";
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

function FontRow({
  label,
  hint,
  monospace,
  family,
  familyPlaceholder,
  onFamilyChange,
  size,
  defaultSize,
  onSizeChange,
}: {
  label: string;
  hint: string;
  monospace: boolean;
  family: string;
  familyPlaceholder: string;
  onFamilyChange: (family: string) => void;
  size: number;
  defaultSize: number;
  onSizeChange: (size: number) => void;
}) {
  return (
    <div className="space-y-2 rounded-md bg-raised px-3 py-2.5">
      <div className="text-sm text-zinc-200">{label}</div>
      <div className="flex items-end gap-3">
        <div className="flex min-w-0 flex-1 items-end gap-1.5">
          <TextInput
            label="Font family"
            size="sm"
            width="100%"
            value={family}
            placeholder={familyPlaceholder}
            hasSpellCheck={false}
            autoComplete="off"
            onChange={onFamilyChange}
          />
          <FontFamilyPicker
            monospaceFirst={monospace}
            onPick={onFamilyChange}
          />
        </div>
        <NumberInput
          label="Size"
          size="sm"
          width={96}
          units="px"
          isIntegerOnly
          value={size}
          min={MIN_FONT_SIZE}
          max={MAX_FONT_SIZE}
          onChange={onSizeChange}
        />
      </div>
      <span className="block text-xs text-zinc-600">
        {hint} Family is a CSS font list, such as{" "}
        <code className="font-mono text-code text-zinc-400">
          Inter, sans-serif
        </code>{" "}
        (empty for the default). Default size is {defaultSize}px.
      </span>
    </div>
  );
}

export default function PreferencesSettingsTab() {
  const composeMode = usePreference("composeMode");
  const composerMaxRows = usePreference("composerMaxRows");
  const collapseFinishedTurns = usePreference("collapseFinishedTurns");
  const uiFontFamily = usePreference("uiFontFamily");
  const uiFontSize = usePreference("uiFontSize");
  const codeFontFamily = usePreference("codeFontFamily");
  const codeFontSize = usePreference("codeFontSize");
  const ideCommand = usePreference("ideCommand");
  const debugModeEnabled = usePreference("debugModeEnabled");
  const debugShowIds = usePreference("debugShowIds");
  const setPreferences = useSetPreferences();

  return (
    <div className="space-y-6">
      <Section title="Chat">
        <ToggleRow
          label="Compose mode"
          hint="Enter inserts a new line in the chat box, and Ctrl+Enter sends
            the message instead."
          checked={composeMode}
          onChange={(composeMode) => setPreferences({ composeMode })}
        />
        <ToggleRow
          label="Collapse finished turns"
          hint="Once the agent finishes, its thinking, tool calls and messages
            before the final reply fold into one expandable “Worked
            for” row."
          checked={collapseFinishedTurns}
          onChange={(collapseFinishedTurns) =>
            setPreferences({ collapseFinishedTurns })
          }
        />
        <div className="rounded-md bg-raised px-3 py-2.5">
          <NumberInput
            label="Max chat box height (lines)"
            description={`The chat box grows with your text up to this many lines, then scrolls. Between ${COMPOSER_MIN_ROWS} and ${MAX_COMPOSER_MAX_ROWS}, default ${DEFAULT_COMPOSER_MAX_ROWS}.`}
            size="sm"
            width={96}
            isIntegerOnly
            value={composerMaxRows}
            min={COMPOSER_MIN_ROWS}
            max={MAX_COMPOSER_MAX_ROWS}
            onChange={(composerMaxRows) => setPreferences({ composerMaxRows })}
          />
        </div>
      </Section>
      <Section title="Fonts">
        <FontRow
          label="Interface text"
          hint="Used for all normal text; every text size in the app scales with it."
          monospace={false}
          family={uiFontFamily}
          familyPlaceholder="Instrument Sans"
          onFamilyChange={(uiFontFamily) => setPreferences({ uiFontFamily })}
          size={uiFontSize}
          defaultSize={DEFAULT_UI_FONT_SIZE}
          onSizeChange={(uiFontSize) => setPreferences({ uiFontSize })}
        />
        <FontRow
          label="Code text"
          hint="Used for code blocks, tool output, terminals and the file editor."
          monospace
          family={codeFontFamily}
          familyPlaceholder="JetBrains Mono"
          onFamilyChange={(codeFontFamily) =>
            setPreferences({ codeFontFamily })
          }
          size={codeFontSize}
          defaultSize={DEFAULT_CODE_FONT_SIZE}
          onSizeChange={(codeFontSize) => setPreferences({ codeFontSize })}
        />
      </Section>
      <Section title="IDE">
        <div className="space-y-1.5 rounded-md bg-raised px-3 py-2.5">
          <TextInput
            label="Command"
            size="sm"
            value={ideCommand}
            placeholder={DEFAULT_IDE_COMMAND}
            hasSpellCheck={false}
            autoComplete="off"
            onChange={(ideCommand) => setPreferences({ ideCommand })}
          />
          <span className="block text-xs text-zinc-600">
            Launched by the title bar's Open button with the current project or
            worktree folder added as the last argument. Use any command on your
            PATH, with optional flags, such as{" "}
            <code className="font-mono text-code text-zinc-400">code</code>,{" "}
            <code className="font-mono text-code text-zinc-400">zed</code>,{" "}
            <code className="font-mono text-code text-zinc-400">cursor</code> or{" "}
            <code className="font-mono text-code text-zinc-400">code -n</code>.
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
          onChange={(debugModeEnabled) => setPreferences({ debugModeEnabled })}
        />
        <ToggleRow
          label="Show IDs in title bar"
          hint="Shows the current project, conversation, and ACP session id in
            the title bar's center section, as `project / conversation /
            session`."
          checked={debugShowIds}
          onChange={(debugShowIds) => setPreferences({ debugShowIds })}
        />
      </Section>
    </div>
  );
}
