import { GeistMono } from 'geist/font/mono'
import { GeistSans } from 'geist/font/sans'
import type { Metadata } from 'next'
import { RootProvider } from 'renoun'

import { Sidebar } from '@/ui/Sidebar'

import './layout.css'

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
          className={`${GeistSans.variable} ${GeistMono.variable} min-h-screen antialiased`}
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
