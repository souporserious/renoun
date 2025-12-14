import type { Metadata } from 'next'
import Link from 'next/link'
import { Geist, Geist_Mono } from 'next/font/google'
import { RootProvider } from 'renoun'

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
        light: 'dracula',
        dark: 'nord',
      }}
      languages={['tsx', 'typescript']}
    >
      <html
        lang="en"
        className="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
      >
        <body
          className={`${geistSans.variable} ${geistMono.variable} min-h-screen antialiased`}
        >
          <Sidebar />

          <main className="md:pl-64 min-h-screen">
            <div className="px-10 pt-24 pb-10 md:pt-24 md:pb-16 max-w-4xl mx-auto">
              {children}
            </div>
          </main>
        </body>
      </html>
    </RootProvider>
  )
}
