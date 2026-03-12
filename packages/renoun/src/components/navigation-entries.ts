import type { Directory, FileSystemEntry } from '../file-system/index.tsx'

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

  const directPathnames = directEntries.map((entry) => entry.getPathname())
  const recursivePathnames = recursiveEntries.map((entry) =>
    entry.getPathname()
  )
  const sharedSuffixLengths = Array.from(
    { length: directEntries.length + 1 },
    () => Array<number>(recursiveEntries.length + 1).fill(0)
  )

  for (
    let directIndex = directEntries.length - 1;
    directIndex >= 0;
    --directIndex
  ) {
    for (
      let recursiveIndex = recursiveEntries.length - 1;
      recursiveIndex >= 0;
      --recursiveIndex
    ) {
      if (directPathnames[directIndex] === recursivePathnames[recursiveIndex]) {
        sharedSuffixLengths[directIndex]![recursiveIndex] =
          1 + sharedSuffixLengths[directIndex + 1]![recursiveIndex + 1]!
        continue
      }

      sharedSuffixLengths[directIndex]![recursiveIndex] = Math.max(
        sharedSuffixLengths[directIndex + 1]![recursiveIndex]!,
        sharedSuffixLengths[directIndex]![recursiveIndex + 1]!
      )
    }
  }

  const mergedEntries: FileSystemEntry<any>[] = []
  let directIndex = 0
  let recursiveIndex = 0

  while (
    directIndex < directEntries.length &&
    recursiveIndex < recursiveEntries.length
  ) {
    if (directPathnames[directIndex] === recursivePathnames[recursiveIndex]) {
      mergedEntries.push(directEntries[directIndex]!)
      directIndex += 1
      recursiveIndex += 1
      continue
    }

    if (
      sharedSuffixLengths[directIndex + 1]![recursiveIndex]! >
      sharedSuffixLengths[directIndex]![recursiveIndex + 1]!
    ) {
      mergedEntries.push(directEntries[directIndex]!)
      directIndex += 1
      continue
    }

    mergedEntries.push(recursiveEntries[recursiveIndex]!)
    recursiveIndex += 1
  }

  while (directIndex < directEntries.length) {
    mergedEntries.push(directEntries[directIndex]!)
    directIndex += 1
  }

  while (recursiveIndex < recursiveEntries.length) {
    mergedEntries.push(recursiveEntries[recursiveIndex]!)
    recursiveIndex += 1
  }

  return mergedEntries
}
