import { useQuery } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { useEffect, useRef } from "react";
import "@xterm/xterm/css/xterm.css";
import {
  DEFAULT_MONO_STACK,
  fontStack,
  watchTerminalFonts,
} from "../../../lib/fontPreferences";
import { type ActionSummary, api } from "../../../lib/tauriApi";
import { terminalTheme } from "../../../lib/terminalTheme";
import { useActiveCheckoutPath } from "../../../lib/useActiveCheckoutPath";
import { useAppStore } from "../../../store";
import { actionsQueryKey } from "../../actions/useActions";

function base64ToBytes(b64: string): Uint8Array {
  if (!b64) return new Uint8Array();
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// Attaches to an Action's process rather than spawning one — unlike
// TerminalPanel, the pty (if any) is already running by the time this
// mounts (started via the Actions tab's Run button, or by an agent's
// run_action tool call). Replays buffered output on open via
// action_backlog, then follows the live `pty://{ptyId}/data` stream for
// whichever pty is currently backing this action, re-attaching whenever
// that changes (a fresh Run after a Stop gets a new ptyId).
export default function ActionTerminalTab({ actionId }: { actionId: string }) {
  // Actions/their run status are scoped to a checkout path (see
  // `actions.rs`'s `run_key` doc comment), not a session id — this tab only
  // ever exists as part of the focused conversation's own panel tabs, so
  // its resolved checkout is always the right one to ask.
  const checkoutPath = useActiveCheckoutPath();
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const attachedPtyIdRef = useRef<string | null>(null);
  const unlistenRef = useRef<(() => void) | null>(null);
  const syncRef = useRef<(() => void) | null>(null);
  const actionsRef = useRef<ActionSummary[]>([]);

  // Shares the same 2s-polled `actionsQueryKey(checkoutPath)` query as
  // `useActions` (ActionsTab / TitleBarActions) instead of running its own
  // independent `listActions` poll — see PLAN.md Phase 1. Keyed on the
  // checkout path so two conversations pinned to the same checkout share
  // one cache entry/poll, matching the backend's own `run_key` granularity.
  const { data: actionsData } = useQuery({
    queryKey: actionsQueryKey(checkoutPath),
    queryFn: () => api.listActions(checkoutPath as string),
    enabled: checkoutPath != null,
    refetchInterval: checkoutPath != null ? 2000 : false,
  });
  actionsRef.current = actionsData ?? [];

  useEffect(() => {
    if (!containerRef.current || !checkoutPath) return;
    const currentCheckoutPath = checkoutPath;

    const term = new Terminal({
      convertEol: true,
      fontSize: useAppStore.getState().codeFontSize,
      fontFamily: fontStack(
        useAppStore.getState().codeFontFamily,
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
      if (attachedPtyIdRef.current) {
        api.ptyResize(attachedPtyIdRef.current, term.cols, term.rows);
      }
    };
    const resizeObserver = new ResizeObserver(refit);
    resizeObserver.observe(containerRef.current);
    const unwatchFonts = watchTerminalFonts(term, refit);

    let disposed = false;

    async function attach(ptyId: string) {
      unlistenRef.current?.();
      attachedPtyIdRef.current = ptyId;
      // A new pty means a fresh run: wipe the previous run's output now
      // rather than after the backlog round trip.
      term.reset();
      const backlog = await api.actionBacklog(currentCheckoutPath, actionId);
      if (disposed) return;
      term.write(base64ToBytes(backlog));
      unlistenRef.current = await listen<string>(`pty://${ptyId}/data`, (e) => {
        term.write(base64ToBytes(e.payload));
      });
    }

    function detach() {
      unlistenRef.current?.();
      unlistenRef.current = null;
      attachedPtyIdRef.current = null;
    }

    function sync() {
      if (disposed) return;
      const action = actionsRef.current.find((a) => a.id === actionId);
      const ptyId = action?.running ? (action.ptyId ?? null) : null;
      if (ptyId !== attachedPtyIdRef.current) {
        if (ptyId) {
          attach(ptyId);
        } else {
          detach();
        }
      }
    }

    syncRef.current = sync;
    sync();

    const onData = term.onData((data) => {
      if (attachedPtyIdRef.current)
        api.ptyWrite(attachedPtyIdRef.current, data);
    });

    return () => {
      disposed = true;
      syncRef.current = null;
      resizeObserver.disconnect();
      unwatchFonts();
      unlistenRef.current?.();
      onData.dispose();
      term.dispose();
    };
  }, [actionId, checkoutPath]);

  // Re-derive attach/detach whenever the shared actions query refreshes —
  // this is what used to be this component's own `setInterval` poll.
  // biome-ignore lint/correctness/useExhaustiveDependencies: syncRef is a ref; actionsData is the actual trigger
  useEffect(() => {
    syncRef.current?.();
  }, [actionsData]);

  return <div ref={containerRef} className="h-full bg-sunken px-2 py-1" />;
}
