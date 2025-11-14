import type { FileSystemEntry } from 'renoun'
import Link from 'next/link'

export function SiblingLink({
  entry,
  direction,
}: {
  entry: FileSystemEntry<any>
  direction: 'previous' | 'next'
}) {
  const isPrevious = direction === 'previous'

  return (
    <Link
      href={entry.getPathname()}
      className={[
        // Card appearance
        'group w-full rounded-md border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-300 transition-colors',
        'hover:border-gray-300 hover:bg-gray-100',
        'dark:border-gray-800 dark:bg-gray-900/40 dark:text-gray-300',
        'dark:hover:border-gray-700 dark:hover:bg-gray-800',
        // Layout
        'grid grid-rows-[auto_auto] gap-1',
        isPrevious
          ? 'grid-cols-[min-content_auto]'
          : 'grid-cols-[auto_min-content]',
        isPrevious ? 'text-left' : 'text-right',
      ].join(' ')}
    >
      <span
        className={[
          'text-xs font-semibold uppercase tracking-[0.16em]',
          'text-gray-400 group-hover:text-gray-300',
          'dark:text-gray-400 dark:group-hover:text-gray-100',
          'row-start-1',
          isPrevious ? 'col-start-2' : 'col-start-1',
        ].join(' ')}
      >
        {isPrevious ? 'Previous' : 'Next'}
      </span>

      <div
        className={[
          'text-gray-300 group-hover:text-gray-50',
          'dark:text-gray-300 dark:group-hover:text-white',
          'row-start-2 col-span-2 grid items-center',
          'grid-cols-[subgrid]',
          isPrevious ? 'justify-items-start' : 'justify-items-end',
        ].join(' ')}
      >
        {isPrevious ? (
          <>
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4 flex-shrink-0"
              aria-hidden="true"
            >
              <path
                d="M14 6L8 12L14 18"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {entry.getBaseName()}
          </>
        ) : (
          <>
            {entry.getBaseName()}
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4 flex-shrink-0"
              aria-hidden="true"
            >
              <path
                d="M10 18L16 12L10 6"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </>
        )}
      </div>
    </Link>
  )
}
