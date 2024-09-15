import { Analytics } from '@vercel/analytics/react'
import type { Metadata } from 'next'
import { GeistSans } from 'geist/font/sans'

import './layout.css'

export const metadata = {
  title: 'Omnidoc',
  description: 'The toolkit to build docs as great as your product.',
} satisfies Metadata

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <link
        href="/favicon-light.svg"
        rel="icon"
        media="(prefers-color-scheme: light)"
      />
      <link
        href="/favicon-dark.svg"
        rel="icon"
        media="(prefers-color-scheme: dark)"
      />
      <body className={GeistSans.className}>
        {children}
        <Analytics />
      </body>
    </html>
  )
}
