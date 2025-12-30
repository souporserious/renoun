import type { FileSystemEntry } from 'renoun'
import Link from 'next/link'

/** Custom EntryIndex component that overrides the app's default. */
export function EntryIndex({
  title,
  entries,
}: {
  title: string
  entries: FileSystemEntry<any>[]
}) {
  return (
    <main className="max-w-none">
      <div className="prose prose-slate dark:prose-invert max-w-none">
        <h1 className="!mt-0 !mb-6">{title}</h1>
      </div>

      <ul className="list-none p-0 m-0 grid gap-4 sm:grid-cols-2">
        {entries.map((entry) => (
          <li key={entry.getPathname()}>
            <Link
              href={entry.getPathname()}
              className="block rounded-lg border border-indigo-200 dark:border-indigo-800 p-4 hover:border-indigo-300 dark:hover:border-indigo-700 hover:bg-indigo-50/50 dark:hover:bg-indigo-800/50 no-underline transition-colors"
            >
              <h2 className="m-0 text-base font-medium">
                {entry.baseName}
              </h2>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
