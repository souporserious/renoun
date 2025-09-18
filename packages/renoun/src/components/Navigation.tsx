import React from 'react'

import {
  isFile,
  type Collection,
  type Directory,
  type FileSystemEntry,
} from '../file-system/index.js'

export interface NavigationComponents {
  Root: React.ComponentType<{
    source: Directory<any> | Collection<any>
    children: React.ReactNode
  }>
  List: React.ComponentType<{
    entry: Directory<any> | Collection<any>
    depth: number
    children: React.ReactNode
  }>
  Item: React.ComponentType<{
    entry: FileSystemEntry<any>
    depth: number
    children: React.ReactNode
  }>
  Link: React.ComponentType<{
    entry: FileSystemEntry<any>
    depth: number
    pathname: string
  }>
}

type InternalNavigationComponents = {
  [Key in keyof NavigationComponents]: NavigationComponents[Key]
}

const defaultComponents: InternalNavigationComponents = {
  Root: ({ children }) => <ol>{children}</ol>,
  List: ({ children }) => <ol>{children}</ol>,
  Item: ({ children }) => <li>{children}</li>,
  Link: ({ entry, pathname }) => <a href={pathname}>{entry.getName()}</a>,
}

export interface NavigationProps {
  source: Directory<any> | Collection<any>
  components?: Partial<NavigationComponents>
}

export async function Navigation({
  source,
  components: componentsProp = {},
}: NavigationProps) {
  const entries = await source.getEntries()
  const components: InternalNavigationComponents = {
    ...defaultComponents,
    ...componentsProp,
  }

  return (
    <components.Root source={source}>
      <components.List entry={source} depth={0}>
        {entries.map((entry) => (
          <Entry
            key={entry.getPathname()}
            entry={entry}
            components={components}
          />
        ))}
      </components.List>
    </components.Root>
  )
}

async function Entry({
  entry,
  components,
}: {
  entry: FileSystemEntry<any>
  components: InternalNavigationComponents
}) {
  const pathname = entry.getPathname()
  const depth = entry.getDepth()

  if (isFile(entry)) {
    return (
      <components.Item entry={entry} depth={depth}>
        <components.Link entry={entry} depth={depth} pathname={pathname} />
      </components.Item>
    )
  }

  const entries = await entry.getEntries()
  const hasChildren = entries.length > 0

  if (!hasChildren) {
    return (
      <components.Item entry={entry} depth={depth}>
        <components.Link entry={entry} depth={depth} pathname={pathname} />
      </components.Item>
    )
  }

  return (
    <components.Item entry={entry} depth={depth}>
      <components.Link entry={entry} depth={depth} pathname={pathname} />
      <components.List entry={entry} depth={depth}>
        {entries.map((childEntry) => (
          <Entry
            key={childEntry.getPathname()}
            entry={childEntry}
            components={components}
          />
        ))}
      </components.List>
    </components.Item>
  )
}
