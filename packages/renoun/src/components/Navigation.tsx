import React, { Suspense } from 'react'

import {
  type Collection,
  type Directory,
  type FileSystemEntry,
  type NavigationEntry,
} from '../file-system/index.tsx'

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
  Link: ({ entry, pathname }) => <a href={pathname}>{entry.name}</a>,
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
  const components: NavigationComponents = {
    ...defaultComponents,
    ...componentsProp,
  }
  const navigationEntries = await source.getTree()
  const renderedEntries = await Promise.all(
    navigationEntries.map((navigationEntry) =>
      renderNavigationItem({
        navigationEntry,
        components,
      })
    )
  )

  return (
    <components.Root source={source}>
      <components.List entry={source} depth={0}>
        {renderedEntries}
      </components.List>
    </components.Root>
  )
}

async function renderNavigationItem({
  navigationEntry,
  components,
}: {
  navigationEntry: NavigationEntry<FileSystemEntry<any>>
  components: NavigationComponents
}): Promise<React.ReactNode> {
  const { entry, children } = navigationEntry
  const pathname = entry.getPathname()
  const depth = entry.depth + 1

  if (!children || children.length === 0) {
    return (
      <components.Item key={pathname} entry={entry} depth={depth}>
        <components.Link entry={entry} depth={depth} pathname={pathname} />
      </components.Item>
    )
  }

  return (
    <components.Item key={pathname} entry={entry} depth={depth}>
      <components.Link entry={entry} depth={depth} pathname={pathname} />
      <components.List entry={entry as Directory<any>} depth={depth}>
        {await Promise.all(
          children.map((childNavigationEntry) =>
            renderNavigationItem({
              navigationEntry: childNavigationEntry,
              components,
            })
          )
        )}
      </components.List>
    </components.Item>
  )
}
