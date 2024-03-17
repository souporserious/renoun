import React from 'react'
import type { Metadata } from 'next'
import { GeistSans } from 'geist/font/sans'
import { Analytics } from '@vercel/analytics/react'
import { PackageStylesAndScript } from 'mdxts/components/PackageInstallClient'

import { getSiteMetadata } from 'utils/get-site-metadata'

import './layout.css'

export function generateMetadata(): Metadata {
  const siteMetadata = getSiteMetadata()
  return {
    ...siteMetadata,
    alternates: {
      canonical: 'https://www.mdxts.dev',
      types: {
        'application/rss+xml': 'https://www.mdxts.dev/rss.xml',
      },
    },
  }
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <meta content="width=device-width, initial-scale=1" name="viewport" />
        <link
          rel="icon"
          type="image/svg+xml"
          href={
            process.env.NODE_ENV === 'development'
              ? '/favicon-dev.svg'
              : '/favicon.svg'
          }
        />
        <link rel="icon" href="/favicon.png" type="image/png" />
      </head>
      <body className={GeistSans.className}>
        {children}
        <Analytics />
        <PackageStylesAndScript />
      </body>
    </html>
  )
}
