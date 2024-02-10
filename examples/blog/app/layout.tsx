import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Blog',
  description: 'A blog built with MDXTS and Next.js.',
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
      <body style={{ fontFamily: 'sans-serif' }}>{children}</body>
    </html>
  )
}
