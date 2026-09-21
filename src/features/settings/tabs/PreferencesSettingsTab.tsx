import { type ReactNode, useEffect, useState } from "react";
import { Input } from "@/ui/input";
import { Label } from "@/ui/label";
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

// Holds what's being typed so an in-between value ("1" on the way to "14")
// isn't rejected, and only commits a number in range; the field snaps back
// to the saved value on blur.
function NumberInput({
  id,
  value,
  min,
  max,
  onCommit,
}: {
  id: string;
  value: number;
  min: number;
  max: number;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return (
    <Input
      id={id}
      type="number"
      min={min}
      max={max}
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        const next = Number(e.target.value);
        if (Number.isInteger(next) && next >= min && next <= max)
          onCommit(next);
      }}
      onBlur={() => setDraft(String(value))}
      className="w-24"
    />
  );
}

function FontRow({
  idPrefix,
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
  idPrefix: string;
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
        <div className="min-w-0 flex-1 space-y-1.5">
          <Label
            htmlFor={`${idPrefix}-family`}
            className="text-xs text-zinc-500"
          >
            Font family
          </Label>
          <div className="flex items-center gap-1.5">
            <Input
              id={`${idPrefix}-family`}
              value={family}
              placeholder={familyPlaceholder}
              spellCheck={false}
              autoComplete="off"
              onChange={(e) => onFamilyChange(e.target.value)}
            />
            <FontFamilyPicker
              monospaceFirst={monospace}
              onPick={onFamilyChange}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-size`} className="text-xs text-zinc-500">
            Size (px)
          </Label>
          <NumberInput
            id={`${idPrefix}-size`}
            value={size}
            min={MIN_FONT_SIZE}
            max={MAX_FONT_SIZE}
            onCommit={onSizeChange}
          />
        </div>
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
        <div className="space-y-1.5 rounded-md bg-raised px-3 py-2.5">
          <Label htmlFor="composer-max-rows" className="text-sm text-zinc-200">
            Max chat box height (lines)
          </Label>
          <NumberInput
            id="composer-max-rows"
            value={composerMaxRows}
            min={COMPOSER_MIN_ROWS}
            max={MAX_COMPOSER_MAX_ROWS}
            onCommit={(composerMaxRows) => setPreferences({ composerMaxRows })}
          />
          <span className="block text-xs text-zinc-600">
            The chat box grows with your text up to this many lines, then
            scrolls. Between {COMPOSER_MIN_ROWS} and {MAX_COMPOSER_MAX_ROWS},
            default {DEFAULT_COMPOSER_MAX_ROWS}.
          </span>
        </div>
      </Section>
      <Section title="Fonts">
        <FontRow
          idPrefix="ui-font"
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
          idPrefix="code-font"
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
          <Label htmlFor="ide-command" className="text-sm text-zinc-200">
            Command
          </Label>
          <Input
            id="ide-command"
            value={ideCommand}
            placeholder={DEFAULT_IDE_COMMAND}
            spellCheck={false}
            autoComplete="off"
            onChange={(e) => setPreferences({ ideCommand: e.target.value })}
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
