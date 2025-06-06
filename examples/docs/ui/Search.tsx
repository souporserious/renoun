'use client'
import { useState } from 'react'
import { SidebarLink } from './SidebarLink'

interface DocEntry {
  path: string
  title: string
}

interface SearchProps {
  entries: DocEntry[]
}

export function Search({ entries }: SearchProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const filteredEntries = entries.filter((entry) =>
    entry.title.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="flex flex-col gap-8">
      <div className="relative">
        <input
          type="text"
          placeholder="Search docs..."
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>
      <nav className="flex flex-col gap-2">
        <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2">
          Documentation
        </span>
        {filteredEntries.length === 0 ? (
          <div className="text-sm text-gray-500 dark:text-gray-400">
            No results found
          </div>
        ) : (
          filteredEntries.map((entry) => (
            <SidebarLink key={entry.path} href={entry.path}>
              {entry.title}
            </SidebarLink>
          ))
        )}
      </nav>
    </div>
  )
}
