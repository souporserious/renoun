import { Analytics } from '@vercel/analytics/react'
import type { Metadata } from 'next'
import { GeistSans } from 'geist/font/sans'
import { PackageInstallScript } from 'renoun/components'

export const metadata = {
  title: 'Renoun',
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
        rel="icon"
        href="/favicon-light.svg"
        media="(prefers-color-scheme: light)"
      />
      <link
        rel="icon"
        href="/favicon-dark.svg"
        media="(prefers-color-scheme: dark)"
      />
      <link
        rel="stylesheet"
        href="/layout.css"
        // @ts-expect-error
        precedence="medium"
      />
      <body className={GeistSans.className}>
        <PackageInstallScript />
        {children}
        <Analytics />
      </body>
    </html>
  )
}
