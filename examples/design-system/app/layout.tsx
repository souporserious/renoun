import type { Metadata } from 'next'
import { Refresh, ThemeProvider } from 'renoun/components'
import Link from 'next/link'

import './layout.css'

export const metadata: Metadata = {
  title: 'Design System',
  description: 'Design system documentation built with renoun and Next.js.',
  robots: {
    index: false,
    follow: false,
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <nav css={{ display: 'flex', gap: '1rem' }}>
            <Link href="/">Home</Link>
            <Link href="/components">Components</Link>
          </nav>
          {children}
        </ThemeProvider>
        <Refresh />
      </body>
    </html>
  )
}
