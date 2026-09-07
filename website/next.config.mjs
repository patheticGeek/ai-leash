import nextra from "nextra";

const withNextra = nextra({});

export default withNextra({
  output: "export",
  images: { unoptimized: true },
  basePath: "/ai-leash",
  trailingSlash: true,
  // Next.js 16 dev mode otherwise writes its own AGENTS.md/CLAUDE.md into
  // this directory on every `next dev` — noise we don't want committed,
  // and confusing sitting next to the repo's real, hand-written AGENTS.md.
  agentRules: false,
});
