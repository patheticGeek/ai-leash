import { Footer, Layout, Navbar } from "nextra-theme-docs";
import { Head } from "nextra/components";
import { getPageMap } from "nextra/page-map";
import "nextra-theme-docs/style.css";

export const metadata = {
  title: {
    template: "%s — Docs",
    default: "ai-leash",
  },
  description:
    "A local-first IDE with an agent chat built in, not bolted on.",
};

export default async function RootLayout({ children }) {
  const navbar = (
    <Navbar
      // next/image's `unoptimized` mode doesn't prepend basePath, and this
      // is a static export with a fixed basePath, so hardcode it here to
      // match next.config.mjs's `basePath: "/ai-leash"`.
      logo={<img src="/ai-leash/wordmark.svg" alt="ai leash" height={20} style={{ height: 20, width: "auto" }} />}
      projectLink="https://github.com/patheticGeek/ai-leash"
    />
  );
  const pageMap = await getPageMap();
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <Head />
      <body>
        <Layout
          navbar={navbar}
          footer={<Footer>ai-leash, built with Nextra.</Footer>}
          editLink="Edit this page on GitHub"
          docsRepositoryBase="https://github.com/patheticGeek/ai-leash/blob/master"
          sidebar={{ defaultMenuCollapseLevel: 1 }}
          pageMap={pageMap}
        >
          {children}
        </Layout>
      </body>
    </html>
  );
}
