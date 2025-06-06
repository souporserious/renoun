'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

export function SiblingLinks({
  routes,
}: {
  routes: { path: string; title: string }[]
}) {
  const pathname = usePathname()
  const currentIndex = routes.findIndex((page) => page.path === pathname)
  const previousPage = currentIndex > 0 ? routes[currentIndex - 1] : null
  const nextPage =
    currentIndex < routes.length - 1 ? routes[currentIndex + 1] : null

  return (
    <div className="fixed top-4 right-4 flex gap-2">
      {previousPage ? (
        <Link
          href={previousPage.path}
          className="p-2 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          aria-label={`Previous: ${previousPage.title}`}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </Link>
      ) : (
        <span className="p-2 rounded-lg bg-gray-50 dark:bg-gray-900 text-gray-300 dark:text-gray-600">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </span>
      )}
      {nextPage ? (
        <Link
          href={nextPage.path}
          className="p-2 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          aria-label={`Next: ${nextPage.title}`}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M9 18l6-6-6-6" />
          </svg>
        </Link>
      ) : (
        <span className="p-2 rounded-lg bg-gray-50 dark:bg-gray-900 text-gray-300 dark:text-gray-600">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M9 18l6-6-6-6" />
          </svg>
        </span>
      )}
    </div>
  )
}
