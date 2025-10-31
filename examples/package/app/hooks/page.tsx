import type { FileSystemEntry } from 'renoun'
import Link from 'next/link'

import { HooksDirectory } from '@/collections'

export default async function Hooks() {
  const entries = await HooksDirectory.getEntries()

  return (
    <main className="prose prose-slate dark:prose-invert max-w-none">
      <h1 className="!mt-0">Hooks</h1>
      <ul className="list-none p-0 m-0 divide-y divide-gray-200 dark:divide-gray-800 border rounded-lg border-gray-200 dark:border-gray-800">
        {entries.map((entry) => (
          <HookEntry key={entry.getPathname()} entry={entry} />
        ))}
      </ul>
    </main>
  )
}

async function HookEntry({ entry }: { entry: FileSystemEntry<any> }) {
  return (
    <li>
      <Link
        href={entry.getPathname()}
        className="block px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 no-underline"
      >
        <h2 className="m-0 text-base font-medium">{entry.getBaseName()}</h2>
      </Link>
    </li>
  )
}
