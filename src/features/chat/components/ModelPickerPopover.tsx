import { Bot, Loader, Search } from "lucide-react";
import { useState } from "react";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/ui/popover";

export interface PickerOption {
  key: string;
  label: string;
  subtitle: string;
  // Heading this row is grouped under — one per provider config/ACP agent
  // (e.g. "GitHub Copilot", listing that agent's own models beneath it),
  // not per backend kind, so two same-kind configs never get merged into
  // one ambiguous group.
  section: string;
}

interface ModelPickerPopoverProps {
  options: PickerOption[];
  activeKey: string | null;
  onSelect: (key: string) => void;
  triggerLabel: string;
  disabled?: boolean;
  // Shows a spinner in place of the agent icon — currently only meaningful
  // while `useChatSession`'s `pendingCrossAgentModelRef` is waiting for a
  // freshly-switched-to agent's connection to come up and report its own
  // options, so the trigger doesn't sit there silently showing the *old*
  // agent's icon/label for that window.
  loading?: boolean;
  // Controlled from outside (rather than the plain internal toggle this
  // started with) so the "/model" local command can pop it open without a
  // real click — see `ChatPanel.tsx`'s `runLocalCommand`.
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// A search-and-pick popover for choosing "which brain answers" — modeled
// visually on Claude Desktop's model switcher (search bar on top, a plain
// list of name+subtitle rows below, active row highlighted). We only needed
// the look, not its full feature set — no keyboard shortcuts, no favoriting,
// no category rail, just enough to replace the old plain <select>.
export default function ModelPickerPopover({
  options,
  activeKey,
  onSelect,
  triggerLabel,
  disabled,
  loading,
  open,
  onOpenChange,
}: ModelPickerPopoverProps) {
  const [query, setQuery] = useState("");

  const filtered = options.filter((o) =>
    `${o.label} ${o.subtitle}`.toLowerCase().includes(query.toLowerCase()),
  );
  // Groups are already contiguous in `options` (built section-by-section
  // upstream in `useChatSession.ts`), so a single pass preserves the
  // original section order — no separate sort needed.
  const sections = new Map<string, PickerOption[]>();
  for (const o of filtered) {
    const rows = sections.get(o.section);
    if (rows) rows.push(o);
    else sections.set(o.section, [o]);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="unstyled"
          size="none"
          disabled={disabled}
          className="flex min-w-0 max-w-[160px] items-center gap-1 rounded-md bg-white/[0.04] px-1.5 py-1 text-xs text-zinc-400 outline-none shadow-[var(--al-shadow)] hover:bg-white/5 hover:text-zinc-200"
        >
          {loading ? (
            <Loader size={12} className="shrink-0 animate-spin" />
          ) : (
            <Bot size={12} className="shrink-0" />
          )}
          <span className="truncate">{triggerLabel}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={8}
        className="w-72 gap-0 overflow-hidden p-0"
      >
        <div className="flex items-center gap-2 px-3 py-2.5">
          <Search size={14} className="shrink-0 text-zinc-500" />
          <Input
            variant="unstyled"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            placeholder="Search models..."
          />
        </div>
        <div className="max-h-72 overflow-auto py-1">
          {filtered.length === 0 && (
            <div className="px-3 py-3 text-sm text-zinc-600">No matches.</div>
          )}
          {[...sections.entries()].map(([section, rows]) => (
            <div key={section}>
              <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-600">
                {section}
              </div>
              {rows.map((o) => (
                <Button
                  key={o.key}
                  variant="unstyled"
                  size="none"
                  onClick={() => {
                    onSelect(o.key);
                    onOpenChange(false);
                  }}
                  className={`block w-full px-3 py-2 text-left ${
                    o.key === activeKey ? "bg-white/10" : "hover:bg-white/5"
                  }`}
                >
                  <div className="text-sm font-medium text-zinc-100">
                    {o.label}
                  </div>
                  <div className="text-xs text-zinc-500">{o.subtitle}</div>
                </Button>
              ))}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
