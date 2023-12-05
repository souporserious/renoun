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
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  )
}
