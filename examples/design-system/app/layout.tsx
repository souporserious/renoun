import type { Metadata } from 'next'
import Link from 'next/link'
import './layout.css'

export const metadata: Metadata = {
  title: 'Design System',
  description: 'Design system documentation built with MDXTS and Next.js.',
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
      <body>
        <Link href="/">Home</Link>
        {children}
      </body>
    </html>
  )
}
