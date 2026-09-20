import { Check, Copy, Play } from "lucide-react";
import {
  createContext,
  isValidElement,
  type ReactNode,
  useContext,
} from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { useCopyToClipboard } from "@/lib/useCopyToClipboard";
import { Button } from "./button";

// Flattens a rendered node back to the source text it came from.
function nodeText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) {
    return nodeText(node.props.children);
  }
  return "";
}

// What the run button on a shell code block does with its command. Provided by
// whoever hosts the transcript (this file doesn't know about terminals); with
// no provider, shell blocks just don't get a run button.
export const RunCommandContext = createContext<
  ((command: string) => void) | null
>(null);

const SHELL_LANGUAGES = new Set(["bash", "sh", "shell", "zsh"]);

// A fenced code block: a header with the language and a copy button above the
// scrollable code.
function CodeBlock({ children }: { children?: ReactNode }) {
  const { copy, copied } = useCopyToClipboard();
  const className = isValidElement<{ className?: string }>(children)
    ? children.props.className
    : undefined;
  const language = /language-(\S+)/.exec(className ?? "")?.[1];
  const runCommand = useContext(RunCommandContext);
  const text = nodeText(children).replace(/\n$/, "");
  return (
    <div className="my-2 overflow-hidden rounded-md bg-sunken">
      <div className="flex items-center justify-between border-b border-border py-0.5 pr-1 pl-2.5 text-xs text-zinc-500">
        <span>{language ?? "text"}</span>
        <div className="flex items-center">
          {runCommand && language && SHELL_LANGUAGES.has(language) && (
            <Button
              variant="quiet"
              size="icon-sm"
              title="Open in a new terminal"
              onClick={() => runCommand(text)}
            >
              <Play size={13} />
            </Button>
          )}
          <Button
            variant="quiet"
            size="icon-sm"
            title="Copy"
            onClick={() => copy(text)}
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
          </Button>
        </div>
      </div>
      <pre className="overflow-x-auto p-2.5 text-code">{children}</pre>
    </div>
  );
}

const components: Components = {
  a: ({ children, ...props }) => (
    <a
      {...props}
      target="_blank"
      rel="noreferrer"
      className="text-blue-400 underline transition-colors duration-150 hover:text-blue-300"
    >
      {children}
    </a>
  ),
  code: ({ className, children, ...props }) => {
    if (!/language-/.test(className ?? "")) {
      return (
        <code
          className="rounded-md bg-sunken px-1 py-0.5 text-zinc-300"
          {...props}
        >
          {children}
        </code>
      );
    }
    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  },
  pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
  p: ({ children, ...props }) => (
    <p className="mb-2 last:mb-0" {...props}>
      {children}
    </p>
  ),
  ul: ({ children, ...props }) => (
    <ul className="mb-2 list-disc space-y-0.5 pl-5 last:mb-0" {...props}>
      {children}
    </ul>
  ),
  ol: ({ children, ...props }) => (
    <ol className="mb-2 list-decimal space-y-0.5 pl-5 last:mb-0" {...props}>
      {children}
    </ol>
  ),
  blockquote: ({ children, ...props }) => (
    <blockquote
      className="mb-2 shadow-[inset_2px_0_0_0_var(--primary)] pl-2.5 text-zinc-400 last:mb-0"
      {...props}
    >
      {children}
    </blockquote>
  ),
  h1: ({ children, ...props }) => (
    <h1 className="mb-1.5 mt-2 text-base font-semibold first:mt-0" {...props}>
      {children}
    </h1>
  ),
  h2: ({ children, ...props }) => (
    <h2 className="mb-1.5 mt-2 text-sm font-semibold first:mt-0" {...props}>
      {children}
    </h2>
  ),
  h3: ({ children, ...props }) => (
    <h3 className="mb-1 mt-2 text-sm font-semibold first:mt-0" {...props}>
      {children}
    </h3>
  ),
  hr: (props) => (
    <hr
      className="my-2 h-0 border-0 shadow-[0_1px_0_0_var(--border)]"
      {...props}
    />
  ),
  table: ({ children, ...props }) => (
    <div className="mb-2 overflow-x-auto last:mb-0">
      <table className="border-collapse text-xs" {...props}>
        {children}
      </table>
    </div>
  ),
  th: ({ children, ...props }) => (
    <th
      className="shadow-[inset_0_0_0_1px_var(--border)] bg-card px-2 py-1 text-left font-medium"
      {...props}
    >
      {children}
    </th>
  ),
  td: ({ children, ...props }) => (
    <td className="shadow-[inset_0_0_0_1px_var(--border)] px-2 py-1" {...props}>
      {children}
    </td>
  ),
  strong: ({ children, ...props }) => (
    <strong className="font-semibold text-zinc-100" {...props}>
      {children}
    </strong>
  ),
};

// Used for assistant/sub-agent text only — user messages are shown as plain
// `whitespace-pre-wrap` text, since they're typed input rather than
// generated prose (matches the convention most chat UIs use).
export default function Markdown({ content }: { content: string }) {
  return (
    <div className="text-sm leading-relaxed wrap-break-word [&>*:last-child]:mb-0">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
