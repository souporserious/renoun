'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

export function SidebarLink({
  href,
  children,
}: {
  href: string
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const isActive = pathname === href || pathname.startsWith(href + '/')

  return (
    <Link
      href={href}
      className={
        `block rounded px-2 py-2 font-medium transition-colors ` +
        (isActive
          ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-semibold'
          : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100')
      }
    >
      {children}
    </Link>
  )
}
