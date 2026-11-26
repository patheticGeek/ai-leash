import { VStack } from "@astryxdesign/core/Stack";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { HtmlPreviewFrame } from "./HtmlPreview";
import Markdown from "./Markdown";

const page = `<!doctype html>
<html>
<head>
<style>
  body { font-family: system-ui, sans-serif; display: grid; place-items: center; padding: 2rem; }
  form { display: grid; gap: .75rem; width: 16rem; }
  input, button { padding: .5rem; font: inherit; }
</style>
</head>
<body>
  <form onsubmit="event.preventDefault(); out.textContent = 'Signed in as ' + email.value">
    <h2>Sign in</h2>
    <input id="email" type="email" placeholder="Email" required>
    <input type="password" placeholder="Password" required>
    <button>Sign in</button>
    <p id="out"></p>
  </form>
</body>
</html>`;

const meta = {
  title: "UI/HtmlPreview",
  component: HtmlPreviewFrame,
  args: { html: page },
  decorators: [
    (Story) => (
      <VStack width={512}>
        <Story />
      </VStack>
    ),
  ],
} satisfies Meta<typeof HtmlPreviewFrame>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

// What the sandbox stops: every line should read "blocked".
export const Sandbox: Story = {
  args: {
    html: `<!doctype html><body><pre id="out"></pre><script>
const lines = [];
const t = (name, f) => { try { f(); lines.push(name + ": allowed"); } catch (e) { lines.push(name + ": blocked"); } };
t("read the app's DOM", () => parent.document.title);
t("read the app's storage", () => localStorage.length);
t("navigate the app", () => { top.location.href = "about:blank"; });
fetch("https://example.com").then(
  () => { lines.push("network: allowed"); out.textContent = lines.join("\\n"); },
  () => { lines.push("network: blocked"); out.textContent = lines.join("\\n"); },
);
out.textContent = lines.join("\\n");
</script>`,
  },
};

// A reply with an ```html block: Preview / Code switch in its header.
export const InMarkdown: Story = {
  render: () => (
    <Markdown
      content={`Here's a first pass at the login page:\n\n\`\`\`html\n${page}\n\`\`\`\n`}
    />
  ),
};

// Still streaming: no closing fence yet, so it stays code.
export const Streaming: Story = {
  render: () => (
    <Markdown content={`Working on it:\n\n\`\`\`html\n${page.slice(0, 200)}`} />
  ),
};
