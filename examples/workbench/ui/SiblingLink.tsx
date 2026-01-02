import type { FileSystemEntry } from 'renoun'
import Link from 'next/link'

/** Custom SiblingLink component that overrides the app's default with indigo accent. */
export function SiblingLink({
  entry,
  direction,
}: {
  entry: FileSystemEntry<any>
  direction: 'previous' | 'next'
}) {
  const isPrevious = direction === 'previous'
  const label = entry.title

  return (
    <Link
      href={entry.getPathname()}
      className={[
        // Card appearance - customized with indigo accent
        'group w-full rounded-md border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-300 transition-colors',
        'hover:border-indigo-300 hover:bg-indigo-100',
        'dark:border-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300',
        'dark:hover:border-indigo-700 dark:hover:bg-indigo-800',
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
          'text-indigo-400 group-hover:text-indigo-300',
          'dark:text-indigo-400 dark:group-hover:text-indigo-100',
          'row-start-1',
          isPrevious ? 'col-start-2' : 'col-start-1',
        ].join(' ')}
      >
        {isPrevious ? 'Previous' : 'Next'}
      </span>

      <div
        className={[
          'text-indigo-600 group-hover:text-indigo-800',
          'dark:text-indigo-300 dark:group-hover:text-white',
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
            {label}
          </>
        ) : (
          <>
            {label}
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
