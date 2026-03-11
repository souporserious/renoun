import type {
  Directory,
  FileSystemEntry,
} from '../file-system/index.tsx'

export function buildNavigationTree(
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

export function mergeNavigationEntries(
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
