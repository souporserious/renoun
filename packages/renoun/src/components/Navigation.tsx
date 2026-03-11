import React, { Suspense } from 'react'

import {
  isDirectory,
  isFile,
  type Collection,
  type Directory,
  type FileSystemEntry,
} from '../file-system/index.tsx'
import { reportBestEffortError } from '../utils/best-effort.ts'
import {
  buildNavigationTree,
  getNavigationEntriesWithDevSWR,
  mergeNavigationEntries,
} from './navigation-entries.ts'

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
  let entries: readonly FileSystemEntry<any>[]
  let childrenByPath:
    | ReadonlyMap<string, readonly FileSystemEntry<any>[]>
    | undefined
  let rootDirectEntryPathnames: ReadonlySet<string> | undefined

  if (isDirectory(source)) {
    const canUseRecursiveTree = source.getFilterPatternKind() === null

    if (!canUseRecursiveTree) {
      entries = await getNavigationEntriesWithDevSWR({
        source,
        cacheKey: 'entries:direct',
        readEntries: () => source.getEntries(),
      })
    } else {
      const directEntriesPromise = getNavigationEntriesWithDevSWR({
        source,
        cacheKey: 'entries:direct',
        readEntries: () => source.getEntries(),
      })

      try {
        const [directEntries, recursiveEntries] = await Promise.all([
          directEntriesPromise,
          getNavigationEntriesWithDevSWR({
            source,
            cacheKey: 'entries:recursive',
            readEntries: () => source.getEntries({ recursive: true }),
          }),
        ])
        const tree = buildNavigationTree(source.getPathname(), recursiveEntries)
        entries = mergeNavigationEntries(directEntries, tree.rootEntries)
        childrenByPath = tree.childrenByPath
        rootDirectEntryPathnames = new Set(
          directEntries.map((entry) => entry.getPathname())
        )
      } catch (error) {
        entries = await directEntriesPromise.catch(() =>
          getNavigationEntriesWithDevSWR({
            source,
            cacheKey: 'entries:direct',
            readEntries: () => source.getEntries(),
          })
        )
        reportBestEffortError('components/navigation', error)
      }
    }
  } else {
    entries = await getNavigationEntriesWithDevSWR({
      source,
      cacheKey: 'entries:direct',
      readEntries: () => source.getEntries(),
    })
  }

  const components: NavigationComponents = {
    ...defaultComponents,
    ...componentsProp,
  }
  const renderedEntries = childrenByPath
    ? await Promise.all(
        entries.map((entry) =>
          renderTreeItem({
            entry,
            components,
            childrenByPath,
            canReadDirectChildren:
              rootDirectEntryPathnames?.has(entry.getPathname()) === true,
          })
        )
      )
    : await Promise.all(
        entries.map((entry) =>
          renderItem({
            entry,
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

async function renderTreeItem({
  entry,
  components,
  childrenByPath,
  canReadDirectChildren,
}: {
  entry: FileSystemEntry<any>
  components: NavigationComponents
  childrenByPath: ReadonlyMap<string, readonly FileSystemEntry<any>[]>
  canReadDirectChildren: boolean
}): Promise<React.ReactNode> {
  const pathname = entry.getPathname()
  const depth = entry.depth + 1

  if (isFile(entry)) {
    return (
      <components.Item key={pathname} entry={entry} depth={depth}>
        <components.Link entry={entry} depth={depth} pathname={pathname} />
      </components.Item>
    )
  }

  const recursiveEntries = childrenByPath.get(pathname) ?? []
  let entries = recursiveEntries
  let directChildPathnames: ReadonlySet<string> | undefined

  if (canReadDirectChildren) {
    const directEntries = await entry.getEntries()
    entries = mergeNavigationEntries(directEntries, recursiveEntries)
    directChildPathnames = new Set(
      directEntries.map((childEntry) => childEntry.getPathname())
    )
  }

  if (entries.length === 0) {
    return (
      <components.Item key={pathname} entry={entry} depth={depth}>
        <components.Link entry={entry} depth={depth} pathname={pathname} />
      </components.Item>
    )
  }

  return (
    <components.Item key={pathname} entry={entry} depth={depth}>
      <components.Link entry={entry} depth={depth} pathname={pathname} />
      <components.List entry={entry} depth={depth}>
        {await Promise.all(
          entries.map((childEntry) =>
            renderTreeItem({
              entry: childEntry,
              components,
              childrenByPath,
              canReadDirectChildren:
                directChildPathnames?.has(childEntry.getPathname()) === true,
            })
          )
        )}
      </components.List>
    </components.Item>
  )
}

/** A navigation item that displays a link to an entry. */
async function renderItem({
  entry,
  components,
}: {
  entry: FileSystemEntry<any>
  components: NavigationComponents
}): Promise<React.ReactNode> {
  const pathname = entry.getPathname()
  const depth = entry.depth + 1

  if (isFile(entry)) {
    return (
      <components.Item key={pathname} entry={entry} depth={depth}>
        <components.Link entry={entry} depth={depth} pathname={pathname} />
      </components.Item>
    )
  }

  const entries = await entry.getEntries()

  if (entries.length === 0) {
    return (
      <components.Item key={pathname} entry={entry} depth={depth}>
        <components.Link entry={entry} depth={depth} pathname={pathname} />
      </components.Item>
    )
  }

  return (
    <components.Item key={pathname} entry={entry} depth={depth}>
      <components.Link entry={entry} depth={depth} pathname={pathname} />
      <components.List entry={entry} depth={depth}>
        {await Promise.all(
          entries.map((childEntry) =>
            renderItem({
              entry: childEntry,
              components,
            })
          )
        )}
      </components.List>
    </components.Item>
  )
}
