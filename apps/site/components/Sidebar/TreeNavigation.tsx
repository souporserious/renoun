import {
  ModuleExportNotFoundError,
  isFile,
  isJavaScriptFile,
  isMDXFile,
  type Directory,
  type FileSystemEntry,
} from 'renoun'
import type { CSSObject } from 'restyle'

import { SidebarLink } from './SidebarLink'

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

    if (baseName.includes('-') && isJavaScriptFile(entry)) {
      const firstExport = await entry
        .getExports()
        .then((fileExports) => fileExports[0])

      return (
        <li>
          <SidebarLink
            css={{ paddingLeft: `${depth * 0.8}rem` }}
            pathname={pathname}
            label={firstExport.getName()}
          />
        </li>
      )
    }

    return (
      <li>
        <SidebarLink
          css={{ paddingLeft: `${depth * 0.8}rem` }}
          pathname={pathname}
          label={
            variant === 'title'
              ? metadata?.label || metadata?.title || baseName
              : baseName
          }
        />
      </li>
    )
  }

  const entries = await entry.getEntries()

  if (entries.length === 0) {
    return (
      <li>
        <SidebarLink
          css={{ paddingLeft: `${depth * 0.8}rem` }}
          pathname={pathname}
          label={
            variant === 'title'
              ? metadata?.label || metadata?.title || entry.getBaseName()
              : entry.getBaseName()
          }
        />
      </li>
    )
  }

  const listStyles: CSSObject = {
    fontSize: 'var(--font-size-body-2)',
    display: 'flex',
    flexDirection: 'column',
    listStyle: 'none',
    paddingLeft: `${depth}rem`,
    marginLeft: '0.25rem',
    borderLeft: '1px solid var(--color-separator)',
  }

  return (
    <li>
      <SidebarLink
        pathname={pathname}
        label={
          variant === 'title'
            ? metadata?.label || metadata?.title || entry.getBaseName()
            : entry.getBaseName()
        }
      />
      <ul style={listStyles}>
        {entries.map((childEntry) => (
          <ListNavigation
            key={childEntry.getPathname()}
            entry={childEntry}
            variant={variant}
          />
        ))}
      </ul>
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
    <ul
      css={{
        fontSize: 'var(--font-size-body-2)',
        display: 'flex',
        flexDirection: 'column',
        listStyle: 'none',
        paddingLeft: 0,
      }}
    >
      {entries.map((entry) => (
        <ListNavigation
          key={entry.getPathname()}
          entry={entry}
          variant={variant}
        />
      ))}
    </ul>
  )
}
