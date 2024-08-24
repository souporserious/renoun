import type { Metadata } from 'next'
import './layout.css'

export const metadata: Metadata = {
  title: 'Docs',
  description: 'A docs site built with MDXTS and Next.js.',
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
      <body>{children}</body>
    </html>
  )
}
