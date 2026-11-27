import { DropdownMenu } from "@astryxdesign/core/DropdownMenu";
import { Lightbox } from "@astryxdesign/core/Lightbox";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { Thumbnail } from "@astryxdesign/core/Thumbnail";
import { Token } from "@astryxdesign/core/Token";
import { Tooltip } from "@astryxdesign/core/Tooltip";
import { spacingVars } from "@astryxdesign/core/theme/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { convertFileSrc } from "@tauri-apps/api/core";
import {
  ExternalLink,
  File,
  FileText,
  FileWarning,
  FolderOpen,
} from "lucide-react";
import {
  type MouseEvent,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
import { formatBytes } from "../../../../lib/format";
import { type Attachment, api } from "../../../../lib/tauriApi";

const styles = stylex.create({
  row: { marginBlockStart: spacingVars["--spacing-2"] },
  // A definite height on the thumbnail's root, the same as its fixed 64px
  // width (4rem; Astryx has no size token for it). Without one, its square
  // image box (`aspect-ratio: 1` around a `height: 100%` <img>) makes
  // WebKitGTK spend ~700ms on every full-document style/layout pass in a
  // long transcript (measured: a root custom-property change, or the
  // Lightbox's `showModal()`, 970ms with the thumbnail vs 240ms with this) —
  // which is what made opening the image viewer take seconds.
  thumbnail: { height: `calc(2 * ${spacingVars["--spacing-8"]})` },
  // The viewer's media box: the dialog stays full-window (so its `::backdrop`
  // dims everything and a click beside the image closes it) and is padded in
  // to at most max(70vw, min(92vw, 720px)) by max(90vh, min(96vh, 560px)),
  // the caption band included. The image already fits inside without
  // upscaling (`max-width/height: 100%`, `object-fit: contain`). The 720/560
  // floors have no Astryx size token.
  viewer: {
    paddingInline: "max(0px, calc((100vw - max(70vw, min(92vw, 720px))) / 2))",
    paddingBlock:
      "max(0px, calc((100dvh - max(90dvh, min(96dvh, 560px))) / 2))",
  },
});

// A thumbnail still being copied in (the composer's drawer).
export function PendingThumbnail({ label }: { label: string }) {
  return <Thumbnail label={label} isLoading xstyle={styles.thumbnail} />;
}

// Stored images, by attachment: an image's URL is its stored copy over
// Tauri's asset protocol (`convertFileSrc`; only the attachments folder is
// in the protocol's scope, see `lib.rs`), so the webview loads, decodes and
// caches it natively and the thumbnail and the viewer share one URL. It's
// used from the first render (the image paints as soon as a frame does,
// instead of after a JS round trip queued behind the transcript rendering);
// a decode in the background (`img.decode()`) is how a failed read is
// noticed, since `Thumbnail` has no error callback. A store
// (`useSyncExternalStore`) so a failure reaches every chip and the viewer.
type ImageState =
  // `url` is shown already; the decode check hasn't come back yet.
  | { status: "loading"; url: string }
  | { status: "ready"; url: string }
  | { status: "error"; error: string };

const images = new Map<string, ImageState>();
const checked = new Set<string>();
const listeners = new Set<() => void>();
let version = 0;

function notify() {
  version += 1;
  for (const l of listeners) l();
}

// The image's state, created on first ask without notifying anyone (it's
// what every reader would compute anyway), so it can back a snapshot.
function imageState(attachment: Attachment): ImageState {
  let state = images.get(attachment.id);
  if (!state) {
    state = attachment.storedPath
      ? { status: "loading", url: convertFileSrc(attachment.storedPath) }
      : { status: "error", error: "No stored copy of this image." };
    images.set(attachment.id, state);
  }
  return state;
}

function checkImage(attachment: Attachment) {
  const state = imageState(attachment);
  if (state.status !== "loading" || checked.has(attachment.id)) return;
  checked.add(attachment.id);
  const { url } = state;
  const probe = new Image();
  probe.src = url;
  probe.decode().then(
    () => {
      images.set(attachment.id, { status: "ready", url });
      notify();
    },
    () => {
      images.set(attachment.id, {
        status: "error",
        error: "Its stored copy couldn't be read.",
      });
      notify();
    },
  );
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function useImage(attachment: Attachment): ImageState {
  useEffect(() => checkImage(attachment), [attachment]);
  return useSyncExternalStore(subscribe, () => imageState(attachment));
}

// Every image's state, for the viewer: re-read whenever any image's
// changes (`version` is the store's snapshot, a stable number).
function useImages(list: Attachment[]): ImageState[] {
  useSyncExternalStore(subscribe, () => version);
  return list.map(imageState);
}

// A blank image for the viewer to show for one that failed; its caption
// says why.
const BLANK_IMAGE =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

// What a chip's tooltip says beyond its name: the original path, size, and
// anything changed on the way in.
function details(a: Attachment) {
  const size =
    a.kind === "image" && a.width && a.height
      ? `${formatBytes(a.size)} · ${a.width}×${a.height}`
      : formatBytes(a.size);
  const warning = attachmentWarning(a);
  return (
    <VStack gap={0}>
      <Text>{a.name}</Text>
      <Text maxLines={3}>{a.originalPath ?? "Pasted"}</Text>
      <Text>{size}</Text>
      {warning && <Text>{warning}</Text>}
    </VStack>
  );
}

// Set when the agent won't get the whole file.
export function attachmentWarning(a: Attachment): string | null {
  if (a.truncated) return "Over 1 MB: only the first 1 MB is attached.";
  if (a.kind === "binary" && !a.storedPath) {
    return "Too large to copy: only its path, type and size are attached.";
  }
  if (a.downscaled) return "Downscaled to fit the 5 MB image limit.";
  return null;
}

function ImageChip({
  attachment,
  onOpen,
  onRemove,
}: {
  attachment: Attachment;
  onOpen: () => void;
  onRemove?: () => void;
}) {
  const image = useImage(attachment);
  return (
    <Tooltip
      content={
        image.status === "error" ? (
          <VStack gap={0}>
            {details(attachment)}
            <Text>Couldn't load it: {image.error}</Text>
          </VStack>
        ) : (
          details(attachment)
        )
      }
      delay={400}
    >
      <Thumbnail
        src={image.status === "error" ? undefined : image.url}
        isLoading={image.status === "loading"}
        alt={attachment.name}
        label={attachment.name}
        onClick={onOpen}
        onRemove={onRemove}
        xstyle={styles.thumbnail}
      />
    </Tooltip>
  );
}

// A non-image file: its name and size; clicking offers to open it or show
// it in the file manager.
function FileChip({
  attachment,
  onRemove,
}: {
  attachment: Attachment;
  onRemove?: () => void;
}) {
  const warning = attachmentWarning(attachment);
  const icon = warning ? (
    <FileWarning size={12} />
  ) : attachment.kind === "text" ? (
    <FileText size={12} />
  ) : (
    <File size={12} />
  );
  const open = (reveal: boolean) =>
    void api.openAttachment(attachment.id, reveal).catch(() => {});
  return (
    <Tooltip content={details(attachment)} delay={400}>
      <DropdownMenu
        placement="above"
        hasChevron={false}
        menuWidth="max-content"
        items={[
          {
            label: "Open",
            icon: <ExternalLink size={14} />,
            onClick: () => open(false),
          },
          {
            label: "Show in folder",
            icon: <FolderOpen size={14} />,
            onClick: () => open(true),
          },
        ]}
        renderTrigger={({ onClick, ...props }) => (
          <Token
            {...props}
            onClick={(e) => onClick?.(e as MouseEvent<HTMLElement>)}
            size="sm"
            color={warning ? "yellow" : "default"}
            label={`${attachment.name} · ${formatBytes(attachment.size)}`}
            icon={icon}
            description={`Attached file ${attachment.name}`}
            onRemove={onRemove}
          />
        )}
      />
    </Tooltip>
  );
}

// The files attached to a message (#73) — in the composer before it's sent
// (`onRemove` set: each chip has a remove button) and under the sent user
// message. Images are thumbnails that open in a lightbox (a gallery of this
// message's images); other files are tokens that open or reveal the file.
export default function AttachmentChips({
  attachments,
  onRemove,
  isInDrawer = false,
}: {
  attachments: Attachment[];
  onRemove?: (id: string) => void;
  // In the composer's drawer, which lays its content out itself.
  isInDrawer?: boolean;
}) {
  const imageAttachments = attachments.filter((a) => a.kind === "image");
  const [viewing, setViewing] = useState<number | null>(null);
  const chips = attachments.map((a) =>
    a.kind === "image" ? (
      <ImageChip
        key={a.id}
        attachment={a}
        onOpen={() => setViewing(imageAttachments.indexOf(a))}
        onRemove={onRemove && (() => onRemove(a.id))}
      />
    ) : (
      <FileChip
        key={a.id}
        attachment={a}
        onRemove={onRemove && (() => onRemove(a.id))}
      />
    ),
  );
  const lightbox = viewing !== null && (
    <ImageViewer
      images={imageAttachments}
      index={viewing}
      onIndexChange={setViewing}
      onClose={() => setViewing(null)}
    />
  );
  if (isInDrawer) {
    return (
      <>
        {chips}
        {lightbox}
      </>
    );
  }
  return (
    <HStack gap={1} wrap="wrap" xstyle={styles.row}>
      {chips}
      {lightbox}
    </HStack>
  );
}

// The message's images in a lightbox, open on `index` straight away: each
// shows as soon as the webview has it (usually already, from its
// thumbnail), with "Loading…" in its caption until it's decoded, or why it
// couldn't be read.
function ImageViewer({
  images: list,
  index,
  onIndexChange,
  onClose,
}: {
  images: Attachment[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}) {
  const states = useImages(list);
  return (
    <Lightbox
      isOpen
      onOpenChange={(open) => !open && onClose()}
      media={list.map((a, i) => {
        const state = states[i];
        return {
          src: state.status === "error" ? BLANK_IMAGE : state.url,
          alt: a.name,
          caption:
            state.status === "ready"
              ? a.name
              : state.status === "loading"
                ? `Loading ${a.name}…`
                : `Couldn't load ${a.name}: ${state.error}`,
        };
      })}
      index={index}
      onIndexChange={onIndexChange}
      hasZoom
      xstyle={styles.viewer}
    />
  );
}
