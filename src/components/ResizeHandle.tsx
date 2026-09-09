export default function ResizeHandle({
  width,
  min,
  max,
  onMouseDown,
  onKeyDown,
}: {
  width: number;
  min: number;
  max: number;
  onMouseDown: (e: React.MouseEvent) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
}) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: this is a focusable, draggable window-splitter (WAI-ARIA APG pattern), which <hr> can't express
    <div
      role="separator"
      aria-orientation="vertical"
      aria-valuenow={width}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onMouseDown={onMouseDown}
      onKeyDown={onKeyDown}
      className="w-1 shrink-0 cursor-col-resize bg-transparent"
    />
  );
}
