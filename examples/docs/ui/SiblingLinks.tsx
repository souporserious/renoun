'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ArrowIcon } from './ArrowIcon'

export function SiblingLinks({
  routes,
}: {
  routes: { pathname: string; title: string }[]
}) {
  const pathname = usePathname()
  const currentIndex = routes.findIndex((page) => page.pathname === pathname)
  const previousPage = currentIndex > 0 ? routes[currentIndex - 1] : null
  const nextPage =
    currentIndex < routes.length - 1 ? routes[currentIndex + 1] : null

  return (
    <div className="flex gap-1">
      {previousPage ? (
        <Link
          href={previousPage.pathname}
          className="p-2 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          title={previousPage.title}
        >
          <ArrowIcon direction="left" size={20} />
        </Link>
      ) : (
        <span className="p-2 rounded-lg bg-gray-50 dark:bg-gray-900 text-gray-300 dark:text-gray-600">
          <ArrowIcon direction="left" size={20} />
        </span>
      )}
      {nextPage ? (
        <Link
          href={nextPage.pathname}
          className="p-2 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          title={nextPage.title}
        >
          <ArrowIcon direction="right" size={20} />
        </Link>
      ) : (
        <span className="p-2 rounded-lg bg-gray-50 dark:bg-gray-900 text-gray-300 dark:text-gray-600">
          <ArrowIcon direction="right" size={20} />
        </span>
      )}
    </div>
  )
}
