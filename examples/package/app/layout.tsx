import type { Metadata } from 'next'
import Link from 'next/link'
import { RootProvider } from 'renoun'

import './layout.css'

export const metadata: Metadata = {
  title: 'Package',
  description: `A simple package documentation example built with renoun and Next.js.`,
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
      git="souporserious/renoun"
      siteUrl="https://renoun.dev"
      theme={{
        light: 'everforest-light',
        dark: [
          'dracula-soft',
          {
            colors: {
              'panel.border': '#666',
            },
          },
        ],
      }}
      languages={['tsx', 'typescript']}
    >
      <html lang="en">
        <body>
          <nav css={{ display: 'flex', gap: '1rem' }}>
            <Link href="/">Home</Link>
            <Link href="/components">Components</Link>
          </nav>
          {children}
        </body>
      </html>
    </RootProvider>
  )
}
