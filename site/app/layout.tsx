import React from 'react'
import { GeistSans } from 'geist/font/sans'
import { Analytics } from '@vercel/analytics/react'

import { getSiteMetadata } from 'utils/get-site-metadata'
import { AppProvider } from './app-provider'

import './layout.css'

export function generateMetadata() {
  return getSiteMetadata()
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <link rel="canonical" href="https://www.mdxts.dev" />
        <link
          rel="icon"
          type="image/svg+xml"
          href={
            process.env.NODE_ENV === 'development'
              ? '/favicon-dev.svg'
              : '/favicon.svg'
          }
        />
      </head>
      <body className={GeistSans.className}>
        <AppProvider>{children}</AppProvider>
        <Analytics />
      </body>
    </html>
  )
}
