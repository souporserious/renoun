import type { Metadata } from 'next'
import { Refresh } from 'renoun/components'
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
    <html lang="en">
      <body>
        {children}
        <Refresh />
      </body>
    </html>
  )
}
