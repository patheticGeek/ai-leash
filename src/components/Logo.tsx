import logoUrl from "../assets/logo.svg";

// A static asset (`src/assets/logo.svg`), not live text — its viewBox was
// computed once from the actual glyph outlines (extracted from Noto Sans
// Bold via fontTools, tightly wrapping the real rendered shapes with no
// leftover space on any side), then baked in as vector paths. This is what
// fixing the root issue actually meant: a hand-picked or runtime-measured
// text-based viewBox still depends on whatever font the platform resolves
// "ui-sans-serif" to — a real logo shouldn't vary with that, so it's no
// longer text at all.
export default function Logo({ className }: { className?: string }) {
  return (
    <img src={logoUrl} alt="ai leash" className={className ?? "h-5 w-auto"} />
  );
}
