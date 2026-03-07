import React, { Suspense } from 'react'

import {
  isDirectory,
  isFile,
  type Collection,
  type Directory,
  type FileSystemEntry,
} from '../file-system/index.tsx'
import { reportBestEffortError } from '../utils/best-effort.ts'
import { isDevelopmentEnvironment } from '../utils/env.ts'

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

interface DevNavigationEntriesCacheEntry {
  value?: readonly FileSystemEntry<any>[]
  updatedAt: number
  invalidationEpoch: number
  refreshTask?: Promise<readonly FileSystemEntry<any>[]>
}

interface SessionLikeWithInvalidation {
  snapshot?: {
    onInvalidate?: (
      listener: (path: string) => void
    ) => (() => void) | undefined
  }
}

interface DevNavigationSourceState {
  invalidationEpoch: number
  entriesCacheByKey: Map<string, DevNavigationEntriesCacheEntry>
  isDisposed: boolean
  sessionUnsubscribeBySession: Map<object, () => void>
  hasTrackedCollectionRoots: boolean
}

const DEV_NAVIGATION_SWR_MAX_STALE_AGE_MS = 30_000
const devNavigationStateBySource = new WeakMap<
  Directory<any> | Collection<any>,
  DevNavigationSourceState
>()
const devNavigationStateFinalizationRegistry =
  typeof FinalizationRegistry === 'function'
    ? new FinalizationRegistry<DevNavigationSourceState>((sourceState) => {
        disposeNavigationSourceState(sourceState)
      })
    : undefined

function disposeNavigationSourceState(
  sourceState: DevNavigationSourceState
): void {
  if (sourceState.isDisposed) {
    return
  }

  sourceState.isDisposed = true
  sourceState.entriesCacheByKey.clear()
  sourceState.hasTrackedCollectionRoots = false

  for (const unsubscribe of sourceState.sessionUnsubscribeBySession.values()) {
    try {
      unsubscribe()
    } catch (error) {
      reportBestEffortError('components/navigation', error)
    }
  }

  sourceState.sessionUnsubscribeBySession.clear()
}

function getNavigationSourceState(
  source: Directory<any> | Collection<any>
): DevNavigationSourceState {
  const existing = devNavigationStateBySource.get(source)
  if (existing) {
    return existing
  }

  const created: DevNavigationSourceState = {
    invalidationEpoch: 0,
    entriesCacheByKey: new Map<string, DevNavigationEntriesCacheEntry>(),
    isDisposed: false,
    sessionUnsubscribeBySession: new Map<object, () => void>(),
    hasTrackedCollectionRoots: false,
  }
  devNavigationStateBySource.set(source, created)
  devNavigationStateFinalizationRegistry?.register(source, created)
  return created
}

function trackNavigationSessionInvalidations(
  sourceState: DevNavigationSourceState,
  session: SessionLikeWithInvalidation | undefined
): void {
  if (sourceState.isDisposed || !session || typeof session !== 'object') {
    return
  }

  const sessionKey = session as object
  if (sourceState.sessionUnsubscribeBySession.has(sessionKey)) {
    return
  }

  const unsubscribe = session.snapshot?.onInvalidate?.(() => {
    sourceState.invalidationEpoch += 1
  })

  if (typeof unsubscribe === 'function') {
    sourceState.sessionUnsubscribeBySession.set(sessionKey, unsubscribe)
  }
}

function trackNavigationEntriesInvalidations(
  sourceState: DevNavigationSourceState,
  entries: readonly FileSystemEntry<any>[]
): void {
  for (const entry of entries) {
    const session = isDirectory(entry)
      ? (entry.getSession() as SessionLikeWithInvalidation)
      : (entry.getParent().getSession() as SessionLikeWithInvalidation)
    trackNavigationSessionInvalidations(sourceState, session)
  }
}

function trackNavigationSourceInvalidations(
  source: Directory<any> | Collection<any>,
  sourceState: DevNavigationSourceState
): void {
  if (!isDevelopmentEnvironment() || sourceState.isDisposed) {
    return
  }

  if (isDirectory(source)) {
    trackNavigationSessionInvalidations(
      sourceState,
      source.getSession() as SessionLikeWithInvalidation
    )
    return
  }

  if (sourceState.hasTrackedCollectionRoots) {
    return
  }

  trackNavigationEntriesInvalidations(sourceState, source.getRootEntries())
  sourceState.hasTrackedCollectionRoots = true
}

async function readNavigationEntriesWithTracking(
  source: Directory<any> | Collection<any>,
  readEntries: () => Promise<readonly FileSystemEntry<any>[]>
): Promise<readonly FileSystemEntry<any>[]> {
  const entries = await readEntries()
  if (isDevelopmentEnvironment() && !isDirectory(source)) {
    trackNavigationEntriesInvalidations(
      getNavigationSourceState(source),
      entries
    )
  }
  return entries
}

async function getNavigationEntriesWithDevSWR({
  source,
  cacheKey,
  readEntries,
}: {
  source: Directory<any> | Collection<any>
  cacheKey: string
  readEntries: () => Promise<readonly FileSystemEntry<any>[]>
}): Promise<readonly FileSystemEntry<any>[]> {
  if (!isDevelopmentEnvironment()) {
    return readEntries()
  }

  const sourceState = getNavigationSourceState(source)
  if (sourceState.isDisposed) {
    return readEntries()
  }
  trackNavigationSourceInvalidations(source, sourceState)
  const cacheBucket = sourceState.entriesCacheByKey
  const cacheEntry = cacheBucket.get(cacheKey)
  const now = Date.now()

  if (cacheEntry?.value) {
    const isWithinStaleWindow =
      now - cacheEntry.updatedAt <= DEV_NAVIGATION_SWR_MAX_STALE_AGE_MS
    const isCurrentInvalidationEpoch =
      cacheEntry.invalidationEpoch === sourceState.invalidationEpoch
    const shouldAwaitFreshEntries = !isCurrentInvalidationEpoch

    if (isWithinStaleWindow && isCurrentInvalidationEpoch) {
      return cacheEntry.value
    }

    if (!cacheEntry.refreshTask) {
      cacheEntry.refreshTask = readNavigationEntriesWithTracking(
        source,
        readEntries
      )
        .then((nextEntries) => {
          cacheEntry.value = nextEntries
          cacheEntry.updatedAt = Date.now()
          cacheEntry.invalidationEpoch = sourceState.invalidationEpoch
          return nextEntries
        })
        .catch((error) => {
          reportBestEffortError('components/navigation', error)
          return cacheEntry.value ?? []
        })
        .finally(() => {
          if (cacheBucket.get(cacheKey) === cacheEntry) {
            cacheEntry.refreshTask = undefined
          }
        })
    }

    if (shouldAwaitFreshEntries && cacheEntry.refreshTask) {
      return cacheEntry.refreshTask
    }

    return cacheEntry.value
  }

  if (cacheEntry?.refreshTask) {
    return cacheEntry.refreshTask
  }

  const createdEntry: DevNavigationEntriesCacheEntry = {
    updatedAt: 0,
    invalidationEpoch: sourceState.invalidationEpoch,
  }
  const refreshTask = readNavigationEntriesWithTracking(source, readEntries)
  createdEntry.refreshTask = refreshTask
  cacheBucket.set(cacheKey, createdEntry)

  try {
    const entries = await refreshTask
    createdEntry.value = entries
    createdEntry.updatedAt = Date.now()
    createdEntry.invalidationEpoch = sourceState.invalidationEpoch
    return entries
  } catch (error) {
    if (cacheBucket.get(cacheKey) === createdEntry) {
      cacheBucket.delete(cacheKey)
    }
    throw error
  } finally {
    if (cacheBucket.get(cacheKey) === createdEntry) {
      createdEntry.refreshTask = undefined
    }
  }
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
      <NavigationAsync
        source={source}
        components={componentsProp}
      />
    </Suspense>
  )
}

async function NavigationAsync({
  source,
  components: componentsProp = {},
}: NavigationProps) {
  let entries: readonly FileSystemEntry<any>[]
  let childrenByPath: ReadonlyMap<string, readonly FileSystemEntry<any>[]> | undefined

  if (isDirectory(source)) {
    const canUseRecursiveTree = source.getFilterPatternKind() !== 'shallow'

    if (!canUseRecursiveTree) {
      entries = await getNavigationEntriesWithDevSWR({
        source,
        cacheKey: 'entries:direct',
        readEntries: () => source.getEntries(),
      })
    } else {
      try {
        const recursiveEntries = await getNavigationEntriesWithDevSWR({
          source,
          cacheKey: 'entries:recursive',
          readEntries: () => source.getEntries({ recursive: true }),
        })
        const tree = buildNavigationTree(source.getPathname(), recursiveEntries)
        entries = tree.rootEntries
        childrenByPath = tree.childrenByPath
      } catch (error) {
        entries = await getNavigationEntriesWithDevSWR({
          source,
          cacheKey: 'entries:direct',
          readEntries: () => source.getEntries(),
        })
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

  return (
    <components.Root source={source}>
      <components.List entry={source} depth={0}>
        {childrenByPath
          ? entries.map((entry) =>
              renderTreeItem({
                entry,
                components,
                childrenByPath,
              })
            )
          : entries.map((entry) => (
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

function renderTreeItem({
  entry,
  components,
  childrenByPath,
}: {
  entry: FileSystemEntry<any>
  components: NavigationComponents
  childrenByPath: ReadonlyMap<string, readonly FileSystemEntry<any>[]>
}): React.ReactNode {
  const pathname = entry.getPathname()
  const depth = entry.depth + 1

  if (isFile(entry)) {
    return (
      <components.Item key={pathname} entry={entry} depth={depth}>
        <components.Link entry={entry} depth={depth} pathname={pathname} />
      </components.Item>
    )
  }

  const entries = childrenByPath.get(pathname) ?? []

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
        {entries.map((childEntry) =>
          renderTreeItem({
            entry: childEntry,
            components,
            childrenByPath,
          })
        )}
      </components.List>
    </components.Item>
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
  const depth = entry.depth + 1

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

function buildNavigationTree(
  rootPathname: string,
  entries: readonly FileSystemEntry<any>[]
): {
  rootEntries: readonly FileSystemEntry<any>[]
  childrenByPath: ReadonlyMap<string, readonly FileSystemEntry<any>[]>
} {
  const childrenByPath = new Map<string, FileSystemEntry<any>[]>()

  for (const entry of entries) {
    const pathname = entry.getPathname()
    const lastSeparatorIndex = pathname.lastIndexOf('/')
    const parentPathname =
      lastSeparatorIndex > 0 ? pathname.slice(0, lastSeparatorIndex) : '/'
    const siblings = childrenByPath.get(parentPathname)

    if (siblings) {
      siblings.push(entry)
    } else {
      childrenByPath.set(parentPathname, [entry])
    }
  }

  return {
    rootEntries: childrenByPath.get(rootPathname) ?? [],
    childrenByPath,
  }
}
