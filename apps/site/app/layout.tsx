import type { Metadata } from 'next'
import Link from 'next/link'
import './layout.css'

export const metadata: Metadata = {
  title: 'Omnidoc',
  description: 'The toolkit to build docs as great as your product.',
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
    <html lang="en">
      <body css={{ padding: '2rem' }}>
        <nav css={{ display: 'flex', gap: '1rem' }}>
          <Link href="/">Omnidoc</Link>
          <Link href="/collections">Collections</Link>
          <Link href="/components">Components</Link>
        </nav>
        {children}
      </body>
    </html>
  )
}
