import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { useEffect, useRef } from "react";
import { getPreferences } from "@/data/preferences";
import "@xterm/xterm/css/xterm.css";
import {
  DEFAULT_MONO_STACK,
  fontStack,
  watchTerminalFonts,
} from "../../../lib/fontPreferences";
import { attachRunOutput } from "../../../lib/runOutput";
import { type ActionSummary, api } from "../../../lib/tauriApi";
import { terminalTheme } from "../../../lib/terminalTheme";
import { useActiveCheckoutPath } from "../../../lib/useActiveCheckoutPath";
import { useActions } from "../../actions/useActions";

// Shows an Action's current or most recent run rather than spawning one —
// unlike TerminalPanel, the process (if any) was started from the Actions
// tab or by an agent's run_action. Follows the action's `runId`: a new run
// (a fresh Run after a Stop) resets the terminal and attaches to it, and a
// finished run still shows its output (see `attachRunOutput` for how the
// snapshot and live chunks are stitched together without gaps or repeats).
// Typing and resizing only reach the process while it's running.
export default function ActionTerminalTab({ actionId }: { actionId: string }) {
  // Actions/their run status are scoped to a checkout path (see
  // `actions.rs`'s `run_key` doc comment), not a session id — this tab only
  // ever exists as part of the focused conversation's own panel tabs, so
  // its resolved checkout is always the right one to ask.
  const checkoutPath = useActiveCheckoutPath();
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  // The live process to forward input/resizes to — null once it has ended.
  const livePtyIdRef = useRef<string | null>(null);
  const attachedRunIdRef = useRef<string | null>(null);
  const detachRef = useRef<(() => void) | null>(null);
  const syncRef = useRef<(() => void) | null>(null);
  const actionsRef = useRef<ActionSummary[]>([]);

  // The same event-fed `qk.actions(checkoutPath)` cache entry every other
  // Actions view reads — a run starting (new `runId`) or ending re-renders
  // this and re-runs `sync` below.
  const { actions: actionsData } = useActions();
  actionsRef.current = actionsData;

  useEffect(() => {
    if (!containerRef.current || !checkoutPath) return;

    const term = new Terminal({
      convertEol: true,
      fontSize: getPreferences().codeFontSize,
      fontFamily: fontStack(
        getPreferences().codeFontFamily,
        DEFAULT_MONO_STACK,
      ),
      theme: terminalTheme,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();
    termRef.current = term;
    fitRef.current = fit;

    const refit = () => {
      fit.fit();
      if (livePtyIdRef.current) {
        api.ptyResize(livePtyIdRef.current, term.cols, term.rows);
      }
    };
    const resizeObserver = new ResizeObserver(refit);
    resizeObserver.observe(containerRef.current);
    const unwatchFonts = watchTerminalFonts(term, refit);

    let disposed = false;

    function sync() {
      if (disposed) return;
      const action = actionsRef.current.find((a) => a.id === actionId);
      livePtyIdRef.current = action?.running ? action.ptyId : null;
      const runId = action?.runId ?? null;
      if (runId === attachedRunIdRef.current) return;
      detachRef.current?.();
      detachRef.current = null;
      attachedRunIdRef.current = runId;
      term.reset();
      if (runId) {
        detachRef.current = attachRunOutput(runId, (bytes) =>
          term.write(bytes),
        );
        refit();
      }
    }

    syncRef.current = sync;
    sync();

    const onData = term.onData((data) => {
      if (livePtyIdRef.current) api.ptyWrite(livePtyIdRef.current, data);
    });

    return () => {
      disposed = true;
      syncRef.current = null;
      resizeObserver.disconnect();
      unwatchFonts();
      detachRef.current?.();
      detachRef.current = null;
      attachedRunIdRef.current = null;
      onData.dispose();
      term.dispose();
    };
  }, [actionId, checkoutPath]);

  // Re-derive attach/detach whenever the shared actions list changes (a
  // `run://status` event patched it).
  // biome-ignore lint/correctness/useExhaustiveDependencies: syncRef is a ref; actionsData is the actual trigger
  useEffect(() => {
    syncRef.current?.();
  }, [actionsData]);

  return <div ref={containerRef} className="h-full bg-sunken px-2 py-1" />;
}
