'use client'

import React from 'react'
import { useServerInsertedHTML } from 'next/navigation'
import { useStyledComponentsRegistry } from 'hooks/useStyledComponentsRegistry'

import './layout.css'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [StyledComponentsRegistry, styledComponentsFlushEffect] =
    useStyledComponentsRegistry()

  useServerInsertedHTML(() => {
    return <>{styledComponentsFlushEffect()}</>
  })

  return (
    <html>
      <head>
        <link rel="canonical" href="https://www.mdxts.com" />
      </head>
      <body>
        <StyledComponentsRegistry>{children}</StyledComponentsRegistry>
      </body>
    </html>
  )
}
