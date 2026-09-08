import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { useEffect, useRef } from "react";
import "@xterm/xterm/css/xterm.css";
import { listen } from "@tauri-apps/api/event";
import { api } from "../lib/tauriApi";
import { useAppStore } from "../store";

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export default function TerminalPanel() {
  const containerRef = useRef<HTMLDivElement>(null);
  const projectRoot = useAppStore((s) => s.projectRoot);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      convertEol: true,
      fontSize: 13,
      fontFamily: "Menlo, Consolas, monospace",
      theme: {
        background: "#0b0c0e",
        foreground: "#d4d4d8",
        cursor: "#d4d4d8",
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();

    let ptyId: string | null = null;
    let disposed = false;
    let unlistenData: (() => void) | undefined;

    (async () => {
      const id = await api.ptySpawn(
        projectRoot ?? undefined,
        term.cols,
        term.rows,
      );
      if (disposed) {
        api.ptyKill(id);
        return;
      }
      ptyId = id;
      unlistenData = await listen<string>(`pty://${id}/data`, (e) => {
        term.write(base64ToBytes(e.payload));
      });
      term.onData((data) => {
        api.ptyWrite(id, data);
      });
    })();

    const resizeObserver = new ResizeObserver(() => {
      fit.fit();
      if (ptyId) api.ptyResize(ptyId, term.cols, term.rows);
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      disposed = true;
      resizeObserver.disconnect();
      unlistenData?.();
      if (ptyId) api.ptyKill(ptyId);
      term.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={containerRef} className="h-full bg-[#0b0c0e] px-2 py-1" />;
}
