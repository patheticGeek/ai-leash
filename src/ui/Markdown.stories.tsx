import { VStack } from "@astryxdesign/core/Stack";
import type { Meta, StoryObj } from "@storybook/react-vite";
import Markdown from "./Markdown";

const content = `# Heading 1
## Heading 2
### Heading 3

A single newline
stays on its own line.

Paragraph with **bold**, \`inline code\` and a [link](https://example.com).

- one
- two

1. first
2. second

> A blockquote.

\`\`\`ts
const x: number = 1;
\`\`\`

A long code line should scroll inside its block, not stretch the parent:

\`\`\`sh
cargo build --release --target x86_64-unknown-linux-gnu --features "acp,ollama,openai-compatible,claude-code,copilot-cli" --manifest-path src-tauri/Cargo.toml -- --verbose --locked --offline
\`\`\`

And a long unbroken inline token: \`aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\`

| Col A | Col B |
| ----- | ----- |
| 1     | 2     |

---

A rich view in a \`\`\`ui block:

\`\`\`ui
{"type": "stats", "items": [{"label": "Tests", "value": "128", "change": "+4", "tone": "success"}, {"label": "Failures", "value": "0"}]}
\`\`\`
`;

const meta = {
  title: "UI/Markdown",
  component: Markdown,
  args: { content },
  decorators: [
    (Story) => (
      <VStack width={512}>
        <Story />
      </VStack>
    ),
  ],
} satisfies Meta<typeof Markdown>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
