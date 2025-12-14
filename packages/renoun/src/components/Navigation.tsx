import React, { Suspense } from 'react'

import {
  isFile,
  type Collection,
  type Directory,
  type FileSystemEntry,
} from '../file-system/index.ts'

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

const defaultComponents: NavigationComponents = {
  Root: ({ children }) => <nav>{children}</nav>,
  List: ({ children }) => <ul>{children}</ul>,
  Item: ({ children }) => <li>{children}</li>,
  Link: ({ entry, pathname }) => <a href={pathname}>{entry.getName()}</a>,
}

export interface NavigationProps {
  source: Directory<any> | Collection<any>
  components?: Partial<NavigationComponents>
}

/** A navigation that displays a list of entries. */
export const Navigation =
  process.env.NODE_ENV === 'development'
    ? NavigationWithFallback
    : NavigationAsync

async function NavigationWithFallback({
  source,
  components: componentsProp = {},
}: NavigationProps) {
  const components: NavigationComponents = {
    ...defaultComponents,
    ...componentsProp,
  }

  return (
    <Suspense
      fallback={
        <components.Root source={source}>
          <components.List entry={source} depth={0}>
            <li>Loading...</li>
          </components.List>
        </components.Root>
      }
    >
      <NavigationAsync source={source} components={componentsProp} />
    </Suspense>
  )
}

async function NavigationAsync({
  source,
  components: componentsProp = {},
}: NavigationProps) {
  const entries = await source.getEntries()
  const components: NavigationComponents = {
    ...defaultComponents,
    ...componentsProp,
  }

  return (
    <components.Root source={source}>
      <components.List entry={source} depth={0}>
        {entries.map((entry) => (
          <Item
            key={entry.getPathname()}
            entry={entry}
            components={components}
          />
        ))}
      </components.List>
    </components.Root>
  )
}

/** A navigation item that displays a link to an entry. */
async function Item({
  entry,
  components,
}: {
  entry: FileSystemEntry<any>
  components: NavigationComponents
}) {
  const pathname = entry.getPathname()
  const depth = entry.getDepth() + 1

  if (isFile(entry)) {
    return (
      <components.Item entry={entry} depth={depth}>
        <components.Link entry={entry} depth={depth} pathname={pathname} />
      </components.Item>
    )
  }

  const entries = await entry.getEntries()

  if (entries.length === 0) {
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
          <Item
            key={childEntry.getPathname()}
            entry={childEntry}
            components={components}
          />
        ))}
      </components.List>
    </components.Item>
  )
}
