import { Analytics } from '@vercel/analytics/react'
import type { Metadata } from 'next'
import { RootProvider } from 'renoun'
import { GeistSans } from 'geist/font/sans'

export const metadata = {
  title: 'renoun - Elevate Your Design System Docs',
  description: `The renoun toolkit uses your React framework to keep documentation polished, in sync, and on brand.`,
} satisfies Metadata

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <RootProvider
      git="souporserious/renoun"
      siteUrl="https://renoun.dev"
      theme="theme.json"
    >
      <html lang="en">
        <link
          rel="icon"
          href="/favicon-light.svg"
          media="(prefers-color-scheme: light)"
        />
        <link
          rel="icon"
          href="/favicon-dark.svg"
          media="(prefers-color-scheme: dark)"
        />
        <link rel="stylesheet" href="/layout.css" precedence="medium" />
        <body className={GeistSans.className}>
          <script
            dangerouslySetInnerHTML={{ __html: tableOfContentsActiveState }}
          />
          {children}
          <Analytics />
        </body>
      </html>
    </RootProvider>
  )
}

const tableOfContentsActiveState = `
const getVisibilityRatio = (element) => {
  const rect = element.getBoundingClientRect();
  const scrollTop = window.scrollY;
  const scrollBottom = scrollTop + window.innerHeight;
  const top = scrollTop + rect.top;
  const bottom = scrollTop + rect.bottom;
  const visibleTop = Math.max(scrollTop, top);
  const visibleBottom = Math.min(scrollBottom, bottom);
  return Math.max(0, visibleBottom - visibleTop) / (bottom - top);
};
let previousActiveSectionId = null;
window.isSectionLinkActive = function (id) {
  const section = document.getElementById(id);
  if (!section) return;
  const currentVisibility = getVisibilityRatio(section);
  if (currentVisibility > 0) {
    if (previousActiveSectionId) {
      const previousSection = document.getElementById(previousActiveSectionId);
      const previousVisibility = getVisibilityRatio(previousSection);
      // Update active only if the current section is more visible
      if (currentVisibility <= previousVisibility) {
        return; // Keep the previous section active
      }
      const previousActiveLink = document.querySelector(\`[href="#\${previousActiveSectionId}"]\`);
      if (previousActiveLink) {
        previousActiveLink.classList.remove("active");
      }
    }
    previousActiveSectionId = id;
  }
  document.currentScript.parentElement.classList.toggle("active", currentVisibility > 0);
};
`
