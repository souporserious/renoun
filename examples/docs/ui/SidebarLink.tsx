'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import * as SidebarCollapse from './SidebarCollapse'

export function SidebarLink({
  href,
  className,
  children,
  collapsible,
}: {
  href: string
  className?: string
  children: React.ReactNode
  collapsible?: React.ReactNode
}) {
  const pathname = usePathname()
  const isActive = pathname === href || pathname.startsWith(href + '/')
  const baseLinkStyles = `flex items-center gap-2 rounded px-2 py-2 font-medium transition-colors outline-none focus-visible:bg-violet-100 dark:focus-visible:bg-blue-400/20${
    className ? ` ${className}` : ''
  }`
  const activeStyles = isActive
    ? ' bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-semibold'
    : ' text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100'

  if (collapsible) {
    return (
      <div
        className={`${baseLinkStyles} ${activeStyles} focus-within:bg-violet-50 dark:focus-within:bg-blue-400/10`}
      >
        <Link href={href} className="flex-1 min-w-0 focus:outline-none order-2">
          {children}
        </Link>
        <SidebarCollapse.Trigger />
      </div>
    )
  }

  return (
    <Link href={href} className={`${baseLinkStyles} pl-8 ${activeStyles}`}>
      {children}
    </Link>
  )
}
