import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

const components: Components = {
  a: ({ children, ...props }) => (
    <a {...props} target="_blank" rel="noreferrer" className="text-blue-400 underline hover:text-blue-300">
      {children}
    </a>
  ),
  code: ({ className, children, ...props }) => {
    if (!/language-/.test(className ?? "")) {
      return (
        <code className="rounded bg-[#101114] px-1 py-0.5 text-[0.85em] text-zinc-300" {...props}>
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
  pre: ({ children, ...props }) => (
    <pre
      className="my-2 overflow-x-auto rounded border border-[#26272c] bg-[#101114] p-2.5 text-xs"
      {...props}
    >
      {children}
    </pre>
  ),
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
    <blockquote className="mb-2 border-l-2 border-[#3a5f8f] pl-2.5 text-zinc-400 last:mb-0" {...props}>
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
  hr: (props) => <hr className="my-2 border-[#26272c]" {...props} />,
  table: ({ children, ...props }) => (
    <div className="mb-2 overflow-x-auto last:mb-0">
      <table className="border-collapse text-xs" {...props}>
        {children}
      </table>
    </div>
  ),
  th: ({ children, ...props }) => (
    <th className="border border-[#26272c] bg-[#141518] px-2 py-1 text-left font-medium" {...props}>
      {children}
    </th>
  ),
  td: ({ children, ...props }) => (
    <td className="border border-[#26272c] px-2 py-1" {...props}>
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
    <div className="text-sm leading-relaxed [&>*:last-child]:mb-0">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
