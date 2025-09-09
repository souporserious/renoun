import type { Metadata } from 'next'
import { RootProvider } from 'renoun'
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
    <RootProvider theme="nord" languages={['css', 'tsx', 'typescript']}>
      <html lang="en">
        <body>{children}</body>
      </html>
    </RootProvider>
  )
}
