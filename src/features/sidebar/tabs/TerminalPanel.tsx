import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { useEffect, useRef } from "react";
import "@xterm/xterm/css/xterm.css";
import { listen } from "@tauri-apps/api/event";
import { api } from "../../../lib/tauriApi";
import { terminalTheme } from "../../../lib/terminalTheme";
import { useAppStore } from "../../../store";

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// Typed at the prompt without a trailing newline, so it waits for the user to
// press Enter. Multi-line text goes in as a bracketed paste so its inner
// newlines don't submit line by line.
function typeAhead(command: string): string {
  return command.includes("\n") ? `\x1b[200~${command}\x1b[201~` : command;
}

export default function TerminalPanel({
  initialCommand,
}: {
  /** Put at the prompt once the shell starts, without running it. */
  initialCommand?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sessionId = useAppStore((s) => s.activeSessionId);

  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-once — spawns one PTY for this tab's lifetime. sessionId can't actually change under a mounted TerminalPanel: switching conversations replaces panelTabs wholesale (see openConversation/startNewConversation in conversationSlice.ts), which unmounts every terminal tab via its key rather than updating this one in place.
  useEffect(() => {
    if (!containerRef.current || !sessionId) return;

    const term = new Terminal({
      convertEol: true,
      fontSize: 13,
      fontFamily:
        '"JetBrains Mono Variable", "JetBrains Mono", "SFMono-Regular", "SF Mono", Consolas, "Liberation Mono", Menlo, monospace',
      theme: terminalTheme,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();

    let ptyId: string | null = null;
    let disposed = false;
    // Set once `pty://{id}/exit` fires — stops forwarding keystrokes/resizes
    // to a process that's no longer there to receive them (harmless either
    // way, `pty_write`/`pty_resize` just error on a missing id, but there's
    // no point making the round trip).
    let exited = false;
    let unlistenData: (() => void) | undefined;
    let unlistenExit: (() => void) | undefined;

    (async () => {
      const id = await api.ptySpawn(sessionId, term.cols, term.rows);
      if (disposed) {
        api.ptyKill(id);
        return;
      }
      ptyId = id;
      if (initialCommand) api.ptyWrite(id, typeAhead(initialCommand));
      unlistenData = await listen<string>(`pty://${id}/data`, (e) => {
        term.write(base64ToBytes(e.payload));
      });
      // Previously unlistened-to anywhere, so the shell dying (crash, `exit`
      // typed by the user, killed externally) just went silent with no
      // indication anything happened — see `pty.rs`'s `exit_event` doc
      // comment for why a deliberate close (this same tab's own unmount)
      // never reaches this handler.
      unlistenExit = await listen(`pty://${id}/exit`, () => {
        exited = true;
        term.write("\r\n\x1b[90m[process exited]\x1b[0m\r\n");
      });
      term.onData((data) => {
        if (!exited) api.ptyWrite(id, data);
      });
    })();

    const resizeObserver = new ResizeObserver(() => {
      fit.fit();
      if (ptyId && !exited) api.ptyResize(ptyId, term.cols, term.rows);
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      disposed = true;
      resizeObserver.disconnect();
      unlistenData?.();
      unlistenExit?.();
      if (ptyId) api.ptyKill(ptyId);
      term.dispose();
    };
  }, []);

  return <div ref={containerRef} className="h-full bg-sunken px-2 py-1" />;
}
