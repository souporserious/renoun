import { Analytics } from '@vercel/analytics/react'
import type { Metadata } from 'next'
import { RootProvider } from 'renoun'
import { GeistSans } from 'geist/font/sans'

export const metadata = {
  title: 'renoun - The Documentation Toolkit for React',
  description: `The renoun toolkit uses your React framework to keep documentation polished, in sync, and on brand.`,
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
        </body>
      </html>
    </RootProvider>
  )
}
