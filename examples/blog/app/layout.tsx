import type { Metadata } from 'next'
import './layout.css'

export const metadata: Metadata = {
  title: 'Blog',
  description: 'A blog built with Renoun and Next.js.',
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
