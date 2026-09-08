import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";

export interface PickerOption {
  key: string;
  label: string;
  subtitle: string;
}

interface ModelPickerPopoverProps {
  options: PickerOption[];
  activeKey: string | null;
  onSelect: (key: string) => void;
  triggerLabel: string;
  disabled?: boolean;
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
}: ModelPickerPopoverProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const filtered = options.filter((o) =>
    `${o.label} ${o.subtitle}`.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="min-w-0 max-w-[160px] truncate rounded border border-[#26272c] bg-[#17181c] px-1.5 py-1 text-xs text-zinc-400 outline-none hover:text-zinc-200 disabled:opacity-50"
      >
        {triggerLabel}
      </button>
      {open && (
        <div className="absolute bottom-full left-0 z-20 mb-2 w-72 overflow-hidden rounded-lg border border-[#26272c] bg-[#141518] shadow-2xl">
          <div className="flex items-center gap-2 border-b border-[#26272c] px-3 py-2.5">
            <Search size={14} className="shrink-0 text-zinc-500" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.currentTarget.value)}
              placeholder="Search models..."
              className="w-full bg-transparent text-sm text-zinc-200 placeholder:text-zinc-600 outline-none"
            />
          </div>
          <div className="max-h-72 overflow-auto py-1">
            {filtered.length === 0 && (
              <div className="px-3 py-3 text-sm text-zinc-600">No matches.</div>
            )}
            {filtered.map((o) => (
              <button
                key={o.key}
                type="button"
                onClick={() => {
                  onSelect(o.key);
                  setOpen(false);
                }}
                className={`block w-full px-3 py-2 text-left ${
                  o.key === activeKey ? "bg-white/10" : "hover:bg-white/5"
                }`}
              >
                <div className="text-sm font-medium text-zinc-100">{o.label}</div>
                <div className="text-xs text-zinc-500">{o.subtitle}</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
