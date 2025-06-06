import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Refresh } from 'renoun/components'
import { routes } from '@/collections'
import { SiblingLinks } from '@/ui/SiblingLinks'
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
  title: 'Blog',
  description: 'A blog built with renoun and Next.js.',
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
    <html
      lang="en"
      className="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
    >
      <body
        className={`${geistSans.variable} ${geistMono.variable} min-h-screen antialiased`}
      >
        <Sidebar />
        <main className="md:pl-64 min-h-screen">
          <div className="px-10 py-20 max-w-4xl mx-auto">
            <SiblingLinks routes={await routes} />
            {children}
          </div>
        </main>
        <Refresh />
      </body>
    </html>
  )
}
