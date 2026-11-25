import { Banner } from "@astryxdesign/core/Banner";
import { List, ListItem } from "@astryxdesign/core/List";
import { VStack } from "@astryxdesign/core/VStack";
import * as stylex from "@stylexjs/stylex";
import type { AcpCommandInfo } from "../../../../lib/tauriApi";

const styles = stylex.create({
  // A long agent command list scrolls inside the banner instead of pushing
  // the composer off screen.
  body: { maxHeight: "40vh" },
});

type HelpBannerProps = {
  commands: AcpCommandInfo[];
  onClose: () => void;
};

// "/help": what this chat accepts — the "!" shell escape, then the local and
// agent "/" commands — as an info `Banner` in the composer's stack, its body
// a compact `List`. Dismissing it closes it (so does sending the next
// message; see `ChatComposer`'s `send`).
export default function HelpBanner({ commands, onClose }: HelpBannerProps) {
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
        <List density="compact" edge="flush">
          <ListItem
            label="!command"
            description={`Run a shell command directly: no permission prompt, the result is shown as a tool call. Start with a space (" !…") to send a literal message instead.`}
          />
          {commands.map((c) => (
            <ListItem
              key={c.name}
              label={c.hint ? `/${c.name} ${c.hint}` : `/${c.name}`}
              description={c.description}
            />
          ))}
        </List>
      </VStack>
    </Banner>
  );
}
