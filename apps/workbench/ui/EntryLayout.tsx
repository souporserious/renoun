import type { ReactNode } from 'react'
import type { FileSystemEntry } from 'renoun'

import { SiblingLink } from './SiblingLink'

type EntryLayoutProps = {
  /** Header content, e.g. the entry title and description. */
  header: ReactNode

  /** Footer content, e.g. "Last updated" timestamp and "View source" link. */
  footer?: ReactNode

  /** The content of the entry. */
  children: ReactNode

  /**
   * Last time the underlying entry was updated. When undefined, the timestamp
   * section is omitted so the layout can stay flexible.
   */
  lastUpdated?: Date | null

  /** The previous entry. */
  previousEntry?: FileSystemEntry<any> | null

  /** The next entry. */
  nextEntry?: FileSystemEntry<any> | null
}

/** The layout for an entry page. */
export function EntryLayout({
  header,
  children,
  lastUpdated,
  previousEntry,
  nextEntry,
  footer: footerActions,
}: EntryLayoutProps) {
  return (
    <div className="flex flex-col gap-12">
      {header}

      {children}

      <div className="border-t border-gray-200 dark:border-gray-800 pt-6">
        <div className="grid grid-cols-2 items-center gap-4 px-4 py-2 text-sm text-gray-600 dark:text-gray-400">
          {lastUpdated ? (
            <div className="text-left">
              Last updated{' '}
              <time
                dateTime={lastUpdated.toISOString()}
                itemProp="dateModified"
                className="font-semibold"
              >
                {lastUpdated.toLocaleString('en', {
                  year: '2-digit',
                  month: '2-digit',
                  day: '2-digit',
                })}
              </time>
            </div>
          ) : null}

          {footerActions ? (
            <div className="flex justify-end gap-4">{footerActions}</div>
          ) : null}
        </div>

        <nav className="grid grid-cols-2 gap-4 px-4 py-2">
          {previousEntry ? (
            <SiblingLink entry={previousEntry} direction="previous" />
          ) : null}
          {nextEntry ? (
            <SiblingLink entry={nextEntry} direction="next" />
          ) : null}
        </nav>
      </div>
    </div>
  )
}
