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
  freshnessKey?: string
  refreshTask?: Promise<readonly FileSystemEntry<any>[]>
}

interface SessionLikeWithInvalidation {
  invalidatePath?: (path: string) => void
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
    trackNavigationSessionInvalidations(
      sourceState,
      getNavigationEntrySession(entry)
    )
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

function getNavigationEntrySession(
  entry: FileSystemEntry<any>
): SessionLikeWithInvalidation {
  return isDirectory(entry)
    ? (entry.getSession() as SessionLikeWithInvalidation)
    : (entry.getParent().getSession() as SessionLikeWithInvalidation)
}

function getNavigationEntryFileSystem(entry: FileSystemEntry<any>): {
  getWorkspaceChangeToken?: (rootPath: string) => Promise<string | null>
} {
  return isDirectory(entry)
    ? entry.getFileSystem()
    : entry.getParent().getFileSystem()
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

async function getDirectoryNavigationFreshnessKey(
  source: Directory<any>
): Promise<string | undefined> {
  const fileSystem = getNavigationEntryFileSystem(source)
  const getWorkspaceChangeToken = fileSystem.getWorkspaceChangeToken

  if (typeof getWorkspaceChangeToken !== 'function') {
    return undefined
  }

  try {
    const workspaceChangeToken = await getWorkspaceChangeToken.call(
      fileSystem,
      source.workspacePath
    )

    return JSON.stringify({
      workspacePath: source.workspacePath,
      supportsWorkspaceChangeToken: true,
      workspaceChangeToken,
    })
  } catch {
    return undefined
  }
}

async function getCollectionNavigationFreshnessKey(
  source: Collection<any>
): Promise<string> {
  const roots = await Promise.all(
    source.getRootEntries().map(async (entry) => {
      const fileSystem = getNavigationEntryFileSystem(entry)
      const getWorkspaceChangeToken = fileSystem.getWorkspaceChangeToken
      let workspaceChangeToken: string | null = null

      if (typeof getWorkspaceChangeToken === 'function') {
        try {
          workspaceChangeToken = await getWorkspaceChangeToken.call(
            fileSystem,
            entry.workspacePath
          )
        } catch {
          workspaceChangeToken = null
        }
      }

      return JSON.stringify({
        kind: isDirectory(entry) ? 'directory' : 'file',
        pathname: entry.getPathname(),
        workspacePath: entry.workspacePath,
        supportsWorkspaceChangeToken:
          typeof getWorkspaceChangeToken === 'function',
        workspaceChangeToken,
      })
    })
  )

  return roots.join('\u0000')
}

async function getNavigationSourceFreshnessKey(
  source: Directory<any> | Collection<any>
): Promise<string | undefined> {
  return isDirectory(source)
    ? getDirectoryNavigationFreshnessKey(source)
    : getCollectionNavigationFreshnessKey(source)
}

function invalidateNavigationSource(
  source: Directory<any> | Collection<any>
): void {
  if (isDirectory(source)) {
    getNavigationEntrySession(source).invalidatePath?.(source.workspacePath)
    return
  }

  for (const entry of source.getRootEntries()) {
    getNavigationEntrySession(entry).invalidatePath?.(entry.workspacePath)
  }
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
  const freshnessKey = await getNavigationSourceFreshnessKey(source)

  if (cacheEntry?.value) {
    const isWithinStaleWindow =
      now - cacheEntry.updatedAt <= DEV_NAVIGATION_SWR_MAX_STALE_AGE_MS
    const isCurrentInvalidationEpoch =
      cacheEntry.invalidationEpoch === sourceState.invalidationEpoch
    const isCurrentFreshnessKey =
      freshnessKey === undefined || cacheEntry.freshnessKey === freshnessKey
    const shouldAwaitFreshEntries =
      !isCurrentInvalidationEpoch || !isCurrentFreshnessKey

    if (!isCurrentFreshnessKey) {
      invalidateNavigationSource(source)
    }

    if (
      isWithinStaleWindow &&
      isCurrentInvalidationEpoch &&
      isCurrentFreshnessKey
    ) {
      return cacheEntry.value
    }

    if (!cacheEntry.refreshTask) {
      const refreshEpoch = sourceState.invalidationEpoch
      const refreshFreshnessKey = freshnessKey
      cacheEntry.refreshTask = readNavigationEntriesWithTracking(
        source,
        readEntries
      )
        .then((nextEntries) => {
          cacheEntry.value = nextEntries
          cacheEntry.updatedAt = Date.now()
          cacheEntry.invalidationEpoch = refreshEpoch
          cacheEntry.freshnessKey = refreshFreshnessKey
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

  const refreshEpoch = sourceState.invalidationEpoch
  const createdEntry: DevNavigationEntriesCacheEntry = {
    updatedAt: 0,
    invalidationEpoch: refreshEpoch,
    freshnessKey,
  }
  const refreshTask = readNavigationEntriesWithTracking(source, readEntries)
  createdEntry.refreshTask = refreshTask
  cacheBucket.set(cacheKey, createdEntry)

  try {
    const entries = await refreshTask
    createdEntry.value = entries
    createdEntry.updatedAt = Date.now()
    createdEntry.invalidationEpoch = refreshEpoch
    createdEntry.freshnessKey = freshnessKey
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
      <components.List entry={source} depth={0}>{renderedEntries}</components.List>
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

function buildNavigationTree(
  rootPathname: string,
  entries: readonly FileSystemEntry<any>[]
): {
  rootEntries: readonly FileSystemEntry<any>[]
  childrenByPath: ReadonlyMap<string, readonly FileSystemEntry<any>[]>
} {
  const childrenByPath = new Map<string, FileSystemEntry<any>[]>()
  const childPathsByParent = new Map<string, Set<string>>()

  const addChildEntry = (
    parentPathname: string,
    entry: FileSystemEntry<any>
  ) => {
    const pathname = entry.getPathname()
    let childPaths = childPathsByParent.get(parentPathname)
    if (!childPaths) {
      childPaths = new Set()
      childPathsByParent.set(parentPathname, childPaths)
    }

    if (childPaths.has(pathname)) {
      return
    }
    childPaths.add(pathname)

    const siblings = childrenByPath.get(parentPathname)
    if (siblings) {
      siblings.push(entry)
    } else {
      childrenByPath.set(parentPathname, [entry])
    }
  }

  const isPathWithinRoot = (pathname: string) => {
    if (rootPathname === '/') {
      return pathname.startsWith('/')
    }

    return pathname === rootPathname || pathname.startsWith(`${rootPathname}/`)
  }

  for (const entry of entries) {
    let currentEntry: FileSystemEntry<any> | undefined = entry

    while (currentEntry) {
      const pathname: string = currentEntry.getPathname()
      let parentDirectory: Directory<any> | undefined

      if (pathname !== rootPathname) {
        try {
          const parent: Directory<any> = currentEntry.getParent()
          parentDirectory =
            parent.getPathname() === pathname ? undefined : parent
        } catch {
          parentDirectory = undefined
        }
      }
      const lastSeparatorIndex = pathname.lastIndexOf('/')
      const parentPathname =
        parentDirectory?.getPathname() ??
        (lastSeparatorIndex > 0 ? pathname.slice(0, lastSeparatorIndex) : '/')

      if (!isPathWithinRoot(parentPathname)) {
        break
      }

      addChildEntry(parentPathname, currentEntry)

      if (!parentDirectory || parentPathname === rootPathname) {
        break
      }

      currentEntry = parentDirectory
    }
  }

  return {
    rootEntries: childrenByPath.get(rootPathname) ?? [],
    childrenByPath,
  }
}

function mergeNavigationEntries(
  directEntries: readonly FileSystemEntry<any>[],
  recursiveEntries: readonly FileSystemEntry<any>[]
): readonly FileSystemEntry<any>[] {
  if (directEntries.length === 0) {
    return recursiveEntries
  }

  if (recursiveEntries.length === 0) {
    return directEntries
  }

  const mergedEntries = [...directEntries]
  const seenPathnames = new Set(
    directEntries.map((entry) => entry.getPathname())
  )

  for (const entry of recursiveEntries) {
    const pathname = entry.getPathname()
    if (seenPathnames.has(pathname)) {
      continue
    }

    seenPathnames.add(pathname)
    mergedEntries.push(entry)
  }

  return mergedEntries
}
