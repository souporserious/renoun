import { Analytics } from '@vercel/analytics/react'
import type { Metadata } from 'next'
import { RootProvider, Script } from 'renoun'
import { GeistSans } from 'geist/font/sans'

export const metadata = {
  title: 'renoun - Query and Render Your Codebase',
  description: `Turn your JavaScript, TypeScript, Markdown, and MDX into reusable structured data for blogs, docs, and presentations.`,
} satisfies Metadata

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <RootProvider git="souporserious/renoun" siteUrl="https://renoun.dev">
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
          {children}
          <Analytics />
          <Script>{import('./script.ts')}</Script>
        </body>
      </html>
    </RootProvider>
  )
}
