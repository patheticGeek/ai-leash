import { Banner } from "@astryxdesign/core/Banner";
import { CommandPaletteGroup } from "@astryxdesign/core/CommandPalette";
import { HStack } from "@astryxdesign/core/HStack";
import { VStack } from "@astryxdesign/core/VStack";
import * as stylex from "@stylexjs/stylex";
import { SquareTerminal } from "lucide-react";
import type { AcpCommandInfo } from "../../../../lib/tauriApi";
import { MenuRow } from "../popovers/ComposerMenu";
import { commandIcon, isLocalCommand } from "../popovers/SlashCommandMenu";

const styles = stylex.create({
  // A long agent command list scrolls inside the banner instead of pushing
  // the composer off screen.
  body: { maxHeight: "40vh" },
});

type HelpBannerProps = {
  commands: AcpCommandInfo[];
  onClose: () => void;
};

// One read-only row: the slash menu's and palette's row (`MenuRow`) at the
// palette item's padding, its description wrapping rather than truncating.
function HelpRow(props: Parameters<typeof MenuRow>[0]) {
  return (
    <HStack paddingInline={3} paddingBlock={2}>
      <MenuRow {...props} isWrapping />
    </HStack>
  );
}

// "/help": what this chat accepts — the "!" shell escape, then the app's
// and the agent's "/" commands — as an info `Banner` in the composer's
// stack. Its body is grouped like the slash menu (`SlashCommandMenu`), with
// the same headings, icons and row style. Dismissing it closes it (so does
// sending the next message; see `ChatComposer`'s `send`).
export default function HelpBanner({ commands, onClose }: HelpBannerProps) {
  const local = commands.filter(isLocalCommand);
  const agent = commands.filter((c) => !isLocalCommand(c));
  const group = (heading: string, list: AcpCommandInfo[]) =>
    list.length > 0 && (
      <CommandPaletteGroup heading={heading}>
        {list.map((c) => (
          <HelpRow
            key={c.name}
            icon={commandIcon(c)}
            label={`/${c.name}`}
            detail={c.description || undefined}
            end={c.hint ?? undefined}
          />
        ))}
      </CommandPaletteGroup>
    );

  return (
    <Banner
      status="info"
      elevation="low"
      collapsible={false}
      isDismissable
      dismissLabel="Close help"
      onDismiss={onClose}
      title="Commands"
      description="Type / or ! at the start of a message."
    >
      <VStack isScrollable xstyle={styles.body}>
        <CommandPaletteGroup heading="Shell">
          <HelpRow
            icon={SquareTerminal}
            label="!command"
            detail={`Run a shell command directly: no permission prompt, the result is shown as a tool call. Start with a space (" !…") to send a literal message instead.`}
          />
        </CommandPaletteGroup>
        {group("Built-in", local)}
        {group("Agent", agent)}
      </VStack>
    </Banner>
  );
}
