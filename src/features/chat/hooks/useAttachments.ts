import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open } from "@tauri-apps/plugin-dialog";
import {
  type ClipboardEvent,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";
import { filePathsIn } from "../../../lib/fileUris";
import { type Attachment, api } from "../../../lib/tauriApi";

// A file being copied into the attachments folder, shown as a loading chip.
export interface PendingAttachment {
  key: string;
  name: string;
}

function baseName(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

// The composer's attachments (#73): files staged for the next message, from
// the attach button (the native file dialog), a paste, or a drop from the
// OS onto `dropTargetRef`. Each is copied into the app's attachments folder
// as soon as it's added (`api.stageAttachment*`), so a sent message only
// names their ids. In memory only, like a new thread's draft: a staged
// attachment nobody sends is swept by the backend later.
// `imagesUnsupportedReason`: set when the chat's agent doesn't take images
// — one staged anyway (its kind is only known once it's staged) is dropped
// with that as the error.
export function useAttachments(
  dropTargetRef: RefObject<HTMLElement | null>,
  onError: (message: string | null) => void,
  imagesUnsupportedReason: string | null = null,
) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [pending, setPending] = useState<PendingAttachment[]>([]);
  // Files from the OS are being dragged over the drop target.
  const [isDragOver, setDragOver] = useState(false);

  const onErrorRef = useRef(onError);
  const imagesReasonRef = useRef(imagesUnsupportedReason);
  useEffect(() => {
    onErrorRef.current = onError;
    imagesReasonRef.current = imagesUnsupportedReason;
  });

  async function stage(name: string, run: () => Promise<Attachment>) {
    const key = crypto.randomUUID();
    setPending((prev) => [...prev, { key, name }]);
    try {
      const attachment = await run();
      const refused =
        attachment.kind === "image" ? imagesReasonRef.current : null;
      if (refused) {
        void api.discardAttachment(attachment.id).catch(() => {});
        onErrorRef.current(`Couldn't attach ${name}: ${refused}`);
        return;
      }
      setAttachments((prev) => [...prev, attachment]);
    } catch (e) {
      onErrorRef.current(`Couldn't attach ${name}: ${e}`);
    } finally {
      setPending((prev) => prev.filter((p) => p.key !== key));
    }
  }

  function addPaths(paths: string[]) {
    for (const path of paths) {
      void stage(baseName(path), () => api.stageAttachmentPath(path));
    }
  }

  function addFiles(files: File[]) {
    for (const file of files) {
      void stage(file.name || "pasted", () => api.stageAttachmentBytes(file));
    }
  }

  async function pickFiles() {
    const picked = await open({ multiple: true, directory: false });
    if (!picked) return;
    addPaths(Array.isArray(picked) ? picked : [picked]);
  }

  // A paste of images or files (rather than text) attaches them.
  function onPaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const data = e.clipboardData;
    const files = Array.from(data.files);
    if (files.length > 0) {
      e.preventDefault();
      addFiles(files);
      return;
    }
    const paths = filePathsIn(
      data.getData("text/uri-list"),
      data.getData("text/plain"),
    );
    if (paths.length > 0) {
      e.preventDefault();
      addPaths(paths);
    }
  }

  // Files dropped from the OS: Tauri hands over their paths (the webview's
  // own drop events never carry them). Only a drop inside the drop target
  // counts, so a split view's other composer doesn't attach them too. A
  // drag that carries no paths (a file-tree row, `MENTION_DRAG_TYPE`) is the
  // `@` mention's, not ours.
  const addPathsRef = useRef(addPaths);
  useEffect(() => {
    addPathsRef.current = addPaths;
  });
  useEffect(() => {
    let dragging = false;
    const inside = (position: { x: number; y: number }) => {
      const el = dropTargetRef.current;
      if (!el) return false;
      const scale = window.devicePixelRatio || 1;
      const x = position.x / scale;
      const y = position.y / scale;
      const r = el.getBoundingClientRect();
      return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    };
    const unlisten = getCurrentWebview().onDragDropEvent(({ payload }) => {
      if (payload.type === "enter") {
        dragging = payload.paths.length > 0;
      }
      if (payload.type === "leave") {
        dragging = false;
        setDragOver(false);
        return;
      }
      if (!dragging) return;
      const over = inside(payload.position);
      if (payload.type === "drop") {
        dragging = false;
        setDragOver(false);
        if (over && payload.paths.length > 0) {
          addPathsRef.current(payload.paths);
        }
        return;
      }
      setDragOver(over);
    });
    return () => {
      void unlisten.then((f) => f());
    };
  }, [dropTargetRef]);

  return {
    attachments,
    pending,
    isDragOver,
    pickFiles,
    onPaste,
    // A chip's remove button: the staged copy goes too.
    remove(id: string) {
      setAttachments((prev) => prev.filter((a) => a.id !== id));
      void api.discardAttachment(id).catch(() => {});
    },
    // Hands what's attached to a message being sent, leaving the box empty.
    take(): Attachment[] {
      const taken = attachments;
      setAttachments([]);
      return taken;
    },
    // Puts back what `take` handed out (the send was called off).
    restore(taken: Attachment[]) {
      setAttachments((prev) => [...taken, ...prev]);
    },
  };
}
