import Link from 'next/link'

import { ComponentsDirectory, HooksDirectory } from '@/collections'
import { SidebarOverlay } from './SidebarOverlay'

export async function Sidebar() {
  const [componentEntries, hookEntries] = await Promise.all([
    ComponentsDirectory.getEntries(),
    HooksDirectory.getEntries(),
  ])

  return (
    <SidebarOverlay>
      <div className="flex flex-col w-full h-full p-5 gap-5">
        <Link
          href="/"
          className="px-3 py-2 text-sm font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider no-underline"
        >
          Package
        </Link>
        <nav className="flex flex-col">
          <Link
            href="/components"
            className="block px-3 py-2 text-xs font-semibold text-gray-400 dark:text-gray-400 uppercase mb-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 no-underline"
          >
            Components
          </Link>
          <ul className="flex flex-col">
            {componentEntries.map((entry) => (
              <li key={entry.getPathname()}>
                <Link
                  href={entry.getPathname()}
                  className="block px-3 py-2 rounded-md text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  {entry.baseName}
                </Link>
              </li>
            ))}
          </ul>
          <div className="h-px bg-gray-200 dark:bg-gray-800 mx-3 my-5" />
          <Link
            href="/hooks"
            className="block px-3 py-2 text-xs font-semibold text-gray-400 dark:text-gray-400 uppercase mb-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 no-underline"
          >
            Hooks
          </Link>
          <ul className="flex flex-col">
            {hookEntries.map((entry) => (
              <li key={entry.getPathname()}>
                <Link
                  href={entry.getPathname()}
                  className="block px-3 py-2 rounded-md text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  {entry.baseName}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </SidebarOverlay>
  )
}
