import {
  isFile,
  isJavaScriptFileWithRuntime,
  type Directory,
  type FileSystemEntry,
} from 'renoun/file-system'
import type { CSSObject } from 'restyle'

import { SidebarLink } from './SidebarLink'

async function ListNavigation({
  entry,
  variant = 'title',
}: {
  entry: FileSystemEntry<any, true>
  variant?: 'name' | 'title'
}) {
  const path = entry.getPath()
  const depth = entry.getDepth()
  const metadata =
    variant === 'title' && isJavaScriptFileWithRuntime(entry)
      ? await (await entry.getExportOrThrow('metadata')).getRuntimeValue()
      : null

  if (isFile(entry)) {
    return (
      <li>
        <SidebarLink
          css={{ paddingLeft: `${depth * 0.8}rem` }}
          pathname={path}
          label={
            variant === 'title'
              ? metadata?.label || metadata?.title || entry.getName()
              : entry.getName()
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
              ? metadata?.label || metadata?.title || entry.getName()
              : entry.getName()
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
            ? metadata?.label || metadata?.title || entry.getName()
            : entry.getName()
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
  collection: Directory<any, true>
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
