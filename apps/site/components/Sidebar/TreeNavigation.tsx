import {
  isFile,
  isJavaScriptFile,
  type Directory,
  type FileSystemEntry,
} from 'renoun/file-system'
import type { CSSObject } from 'restyle'

import { SidebarLink } from './SidebarLink'

async function ListNavigation({
  entry,
  variant = 'title',
}: {
  entry: FileSystemEntry<any>
  variant?: 'name' | 'title'
}) {
  const path = entry.getPath()
  const depth = entry.getDepth()
  const metadata =
    variant === 'title' && isJavaScriptFile(entry)
      ? await entry.getExportValueOrThrow('metadata')
      : null

  if (isFile(entry)) {
    return (
      <li>
        <SidebarLink
          css={{ paddingLeft: `${depth * 0.8}rem` }}
          pathname={path}
          label={
            variant === 'title'
              ? metadata?.label || metadata?.title || entry.getBaseName()
              : entry.getBaseName()
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
          pathname={path}
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
        pathname={path}
        label={
          variant === 'title'
            ? metadata?.label || metadata?.title || entry.getBaseName()
            : entry.getBaseName()
        }
      />
      <ul style={listStyles}>
        {entries.map((childEntry) => (
          <ListNavigation
            key={childEntry.getPath()}
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
      {entries.map((entry) => {
        return (
          <ListNavigation
            key={entry.getPath()}
            entry={entry}
            variant={variant}
          />
        )
      })}
    </ul>
  )
}
