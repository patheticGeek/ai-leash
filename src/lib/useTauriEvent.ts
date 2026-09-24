import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useEffect, useRef } from "react";

type Handler<T> = (payload: T) => void;

interface Registration {
  handlers: Set<Handler<unknown>>;
  unlistenPromise: Promise<UnlistenFn>;
}

const registrations = new Map<string, Registration>();

// Non-hook form of `useTauriEvent`, for code that manages its own lifetime
// (e.g. `runOutput.ts`'s attach/detach) — same shared listener.
export function subscribeTauriEvent<T>(
  eventName: string,
  handler: Handler<T>,
): () => void {
  return subscribe(eventName, handler);
}

function subscribe<T>(eventName: string, handler: Handler<T>): () => void {
  let reg = registrations.get(eventName);
  if (!reg) {
    const handlers = new Set<Handler<unknown>>();
    const unlistenPromise = listen<T>(eventName, (e) => {
      for (const h of handlers) h(e.payload);
    });
    reg = { handlers, unlistenPromise };
    registrations.set(eventName, reg);
  }
  reg.handlers.add(handler as Handler<unknown>);
  const activeReg = reg;
  return () => {
    activeReg.handlers.delete(handler as Handler<unknown>);
    if (activeReg.handlers.size === 0) {
      registrations.delete(eventName);
      activeReg.unlistenPromise.then((f) => f());
    }
  };
}

// Shares one real Tauri `listen()` call across every component subscribed to
// the same `eventName`, fanning each event out to all of their handlers.
// Used by `useCurrentGitBranch` (one listener instead of one per sidebar row
// and per open `CheckoutBar`) and `FileTree` (one listener instead of one
// per expanded tree node). Callers still get a fresh closure every render
// (handler is read via a ref), so no dependency array footguns.
export function useTauriEvent<T>(eventName: string, handler: Handler<T>): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    return subscribe<T>(eventName, (payload) => handlerRef.current(payload));
  }, [eventName]);
}
