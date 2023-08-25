'use client'
import React from 'react'
import { AppProvider } from './app-provider'

import './layout.css'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html>
      <head>
        <link rel="canonical" href="https://www.mdxts.com" />
      </head>
      <body>
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  )
}
