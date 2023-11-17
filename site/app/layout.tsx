import React from 'react'
import { GeistSans } from 'geist/font/sans'
import { AppProvider } from './app-provider'

import './layout.css'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <link rel="canonical" href="https://www.mdxts.com" />
      </head>
      <body className={GeistSans.className}>
        <div
          style={{
            fontWeight: 600,
            fontSize: 14,
            padding: '1rem',
            backgroundColor: '#d39e5a',
            color: '#1c1309',
            textAlign: 'center',
          }}
        >
          This package is still a work in progress. The APIs are not stable and
          may change.
        </div>
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  )
}
