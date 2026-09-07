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
      logo={
        <div>
          <b>ai</b> leash
        </div>
      }
      projectLink="https://github.com/patheticGeek/ai-leash"
    />
  );
  const pageMap = await getPageMap();
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <Head faviconGlyph="🐕" />
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
