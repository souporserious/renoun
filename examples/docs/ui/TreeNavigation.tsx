import {
  ModuleExportNotFoundError,
  isFile,
  isJavaScriptFile,
  isMDXFile,
  type Directory,
  type FileSystemEntry,
} from 'renoun'

import { SidebarLink } from './SidebarLink'
import * as SidebarCollapse from './SidebarCollapse'

async function ListNavigation({
  entry,
  variant = 'title',
}: {
  entry: FileSystemEntry<any>
  variant?: 'name' | 'title'
}) {
  const pathname = entry.getPathname()
  const depth = entry.getDepth()
  const metadata =
    variant === 'title' && (isJavaScriptFile(entry) || isMDXFile(entry))
      ? await entry.getExportValue('metadata').catch((error) => {
          if (error instanceof ModuleExportNotFoundError) {
            return undefined
          }
          throw error
        })
      : null

  if (isFile(entry)) {
    const baseName = entry.getBaseName()
    return (
      <li>
        <SidebarLink href={pathname} className={depth > 0 ? 'pl-6' : ''}>
          {variant === 'title'
            ? metadata?.label || metadata?.title || entry.getTitle()
            : baseName}
        </SidebarLink>
      </li>
    )
  }

  const entries = await entry.getEntries()

  if (entries.length === 0) {
    return (
      <li>
        <SidebarLink href={pathname} className={depth > 0 ? 'pl-6' : ''}>
          {variant === 'title'
            ? metadata?.label || metadata?.title || entry.getTitle()
            : entry.getBaseName()}
        </SidebarLink>
      </li>
    )
  }

  return (
    <li>
      <SidebarCollapse.Provider pathname={pathname}>
        <SidebarLink
          href={pathname}
          className={depth > 0 ? 'pl-6' : ''}
          collapsible
        >
          {variant === 'title'
            ? metadata?.label || metadata?.title || entry.getTitle()
            : entry.getBaseName()}
        </SidebarLink>
        <SidebarCollapse.Content>
          <ul className="flex flex-col list-none text-sm relative before:absolute before:left-[1.25rem] before:-translate-x-1/2 before:top-0 before:bottom-0 before:w-px before:bg-gray-200 dark:before:bg-gray-800">
            {entries.map((childEntry) => (
              <ListNavigation
                key={childEntry.getPathname()}
                entry={childEntry}
                variant={variant}
              />
            ))}
          </ul>
        </SidebarCollapse.Content>
      </SidebarCollapse.Provider>
    </li>
  )
}

export async function TreeNavigation({
  collection,
  variant,
}: {
  collection: Directory<any>
  variant?: 'name' | 'title'
}) {
  const entries = await collection.getEntries()

  return (
    <ul className="text-sm flex flex-col list-none pl-0">
      {entries.map((entry) => {
        return (
          <ListNavigation
            key={entry.getPathname()}
            entry={entry}
            variant={variant}
          />
        )
      })}
    </ul>
  )
}
