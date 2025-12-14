import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { RootProvider } from 'renoun'
import { Layout } from '@/ui/Layout'
import { Sidebar } from '@/ui/Sidebar'
import './layout.css'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

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
          className={`${geistSans.variable} ${geistMono.variable} min-h-screen antialiased [--column-gap:0] md:[--column-gap:2rem] lg:[--column-gap:4rem] [--grid-template-columns:minmax(1rem,1fr)_14rem_var(--column-gap)_minmax(0,48rem)_var(--column-gap)_14rem_minmax(1rem,1fr)]`}
        >
          <Sidebar />
          <Layout>{children}</Layout>
        </body>
      </html>
    </RootProvider>
  )
}
