import { DropdownMenu } from "@astryxdesign/core/DropdownMenu";
import { Lightbox } from "@astryxdesign/core/Lightbox";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { Thumbnail } from "@astryxdesign/core/Thumbnail";
import { Token } from "@astryxdesign/core/Token";
import { Tooltip } from "@astryxdesign/core/Tooltip";
import { spacingVars } from "@astryxdesign/core/theme/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import {
  ExternalLink,
  File,
  FileText,
  FileWarning,
  FolderOpen,
} from "lucide-react";
import { type MouseEvent, useEffect, useState } from "react";
import { formatBytes } from "../../../../lib/format";
import { type Attachment, api } from "../../../../lib/tauriApi";

const styles = stylex.create({
  row: { marginBlockStart: spacingVars["--spacing-2"] },
});

// Blob URLs of stored images, one per attachment for the app's lifetime —
// a transcript re-rendering (or the composer's chip becoming the sent
// message's) doesn't fetch the bytes again.
const imageUrls = new Map<string, Promise<string>>();

function imageUrl(attachment: Attachment): Promise<string> {
  let url = imageUrls.get(attachment.id);
  if (!url) {
    url = api
      .readAttachment(attachment.id)
      .then((bytes) =>
        URL.createObjectURL(new Blob([bytes], { type: attachment.mime })),
      );
    url.catch(() => imageUrls.delete(attachment.id));
    imageUrls.set(attachment.id, url);
  }
  return url;
}

function useImageUrl(attachment: Attachment): string | undefined {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    let live = true;
    imageUrl(attachment).then(
      (u) => live && setUrl(u),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [attachment]);
  return url;
}

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
  const src = useImageUrl(attachment);
  return (
    <Tooltip content={details(attachment)} delay={400}>
      <Thumbnail
        src={src}
        alt={attachment.name}
        label={attachment.name}
        isLoading={!src}
        onClick={onOpen}
        onRemove={onRemove}
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
  const images = attachments.filter((a) => a.kind === "image");
  const [viewing, setViewing] = useState<number | null>(null);
  const urls = useImageUrls(viewing === null ? [] : images);
  const chips = attachments.map((a) =>
    a.kind === "image" ? (
      <ImageChip
        key={a.id}
        attachment={a}
        onOpen={() => setViewing(images.indexOf(a))}
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
  const lightbox = viewing !== null && urls && (
    <Lightbox
      isOpen
      onOpenChange={(open) => !open && setViewing(null)}
      media={images.map((a, i) => ({
        src: urls[i],
        alt: a.name,
        caption: a.name,
      }))}
      index={viewing}
      onIndexChange={setViewing}
      hasZoom
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

// Every image's URL once all have loaded (they're cached by the time a
// thumbnail was clicked).
function useImageUrls(images: Attachment[]): string[] | null {
  const [urls, setUrls] = useState<string[] | null>(null);
  const key = images.map((a) => a.id).join(",");
  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` stands for `images`, which is a fresh array every render
  useEffect(() => {
    let live = true;
    if (images.length === 0) {
      setUrls(null);
      return;
    }
    Promise.all(images.map(imageUrl)).then(
      (u) => live && setUrls(u),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [key]);
  return urls;
}
