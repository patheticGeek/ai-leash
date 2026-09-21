import { Bot, Loader } from "lucide-react";
import { Button } from "@/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/ui/command";
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
  // Renders the trigger as a danger chip with this as its title — used when
  // the active agent is turned off in Settings.
  dangerMessage?: string | null;
  disabled?: boolean;
  // Shows a spinner in place of the agent icon — currently only meaningful
  // while `useChatSession`'s `pendingCrossAgentModelRef` is waiting for a
  // freshly-switched-to agent's connection to come up and report its own
  // options, so the trigger doesn't sit there silently showing the *old*
  // agent's icon/label for that window.
  loading?: boolean;
  // Controlled from outside (rather than the plain internal toggle this
  // started with) so the "/model" local command can pop it open without a
  // real click — see `ChatComposer.tsx`'s `runLocalCommand`.
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
  dangerMessage,
  disabled,
  loading,
  open,
  onOpenChange,
}: ModelPickerPopoverProps) {
  // Groups are already contiguous in `options` (built section-by-section
  // upstream in `useChatSession.ts`), so a single pass preserves the
  // original section order — no separate sort needed.
  const sections = new Map<string, PickerOption[]>();
  for (const o of options) {
    const rows = sections.get(o.section);
    if (rows) rows.push(o);
    else sections.set(o.section, [o]);
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant={dangerMessage ? "chip-danger" : "chip"}
          size="sm"
          title={dangerMessage ?? undefined}
          disabled={disabled}
          className="flex min-w-0 max-w-[160px]"
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
        <Command defaultValue={activeKey ?? undefined}>
          <CommandInput placeholder="Search models..." autoFocus />
          <CommandList>
            <CommandEmpty>No matches.</CommandEmpty>
            {[...sections.entries()].map(([section, rows]) => (
              <CommandGroup key={section} heading={section}>
                {rows.map((o) => (
                  <CommandItem
                    key={o.key}
                    value={o.key}
                    keywords={[o.label, o.subtitle, o.section]}
                    data-checked={o.key === activeKey}
                    checkIcon
                    onSelect={() => {
                      onSelect(o.key);
                      onOpenChange(false);
                    }}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-zinc-100">
                        {o.label}
                      </div>
                      <div className="text-xs text-zinc-500">{o.subtitle}</div>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
