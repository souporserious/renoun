import type { Metadata } from 'next'
import Link from 'next/link'
import { RootProvider } from 'renoun'

import { ThemeToggle } from './theme-toggle'
import './layout.css'

export const metadata: Metadata = {
  title: 'Blog',
  description: 'A blog built with renoun and Next.js.',
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
    <RootProvider
      theme={{
        light: 'github-light',
        dark: 'github-dark',
      }}
    >
      <html lang="en" data-theme="light">
        <body>
          <div className="layout">
            <header className="layout__header">
              <Link href="/" className="layout__title">
                blog
              </Link>
              <ThemeToggle />
            </header>
            {children}
          </div>
        </body>
      </html>
    </RootProvider>
  )
}
