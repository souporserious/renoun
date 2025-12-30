import { GeistMono } from 'geist/font/mono'
import { GeistSans } from 'geist/font/sans'
import type { Metadata } from 'next'
import { RootProvider } from 'renoun'
import { Layout } from '@/ui/Layout'
import { Sidebar } from '@/ui/Sidebar'
import './layout.css'

export const metadata: Metadata = {
  title: 'Docs',
  description: 'A documentation site built with renoun and Next.js.',
  robots: {
    index: false,
    follow: false,
  },
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <RootProvider
      theme={{
        light: 'dracula',
        dark: 'nord',
      }}
    >
      <html
        lang="en"
        className="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
      >
        <body
          className={`${GeistSans.variable} ${GeistMono.variable} min-h-screen antialiased [--column-gap:0] md:[--column-gap:2rem] lg:[--column-gap:4rem] [--grid-template-columns:minmax(1rem,1fr)_14rem_var(--column-gap)_minmax(0,48rem)_var(--column-gap)_14rem_minmax(1rem,1fr)]`}
        >
          <Sidebar />
          <Layout>{children}</Layout>
        </body>
      </html>
    </RootProvider>
  )
}
