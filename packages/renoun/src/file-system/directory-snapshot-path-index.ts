import { normalizePathKey } from '../utils/path.ts'

interface IndexedStringKeyMapOptions {
  onAdd: (key: string) => void
  onDelete: (key: string) => void
  onClear: () => void
}

export class IndexedStringKeyMap<Value> extends Map<string, Value> {
  readonly #onAdd: (key: string) => void
  readonly #onDelete: (key: string) => void
  readonly #onClear: () => void

  constructor(options: IndexedStringKeyMapOptions) {
    super()
    this.#onAdd = options.onAdd
    this.#onDelete = options.onDelete
    this.#onClear = options.onClear
  }

  override set(key: string, value: Value): this {
    const existed = super.has(key)
    super.set(key, value)
    if (!existed) {
      this.#onAdd(key)
    }
    return this
  }

  override delete(key: string): boolean {
    const deleted = super.delete(key)
    if (deleted) {
      this.#onDelete(key)
    }
    return deleted
  }

  override clear(): void {
    if (this.size === 0) {
      return
    }
    super.clear()
    this.#onClear()
  }
}

export interface DirectorySnapshotPathIndexOptions {
  maxPrefixKeys: number
  prefixIndexReenableRatio: number
}

export class DirectorySnapshotPathIndex {
  readonly #maxPrefixKeys: number
  readonly #prefixIndexReenableRatio: number
  readonly #snapshotPathByKey = new Map<string, string>()
  readonly #keysByExactPath = new Map<string, Set<string>>()
  readonly #keysByPrefixPath = new Map<string, Set<string>>()
  #prefixIndexEnabled = true

  constructor(options: DirectorySnapshotPathIndexOptions) {
    this.#maxPrefixKeys = options.maxPrefixKeys
    this.#prefixIndexReenableRatio = Math.min(
      1,
      Math.max(0, options.prefixIndexReenableRatio)
    )
  }

  add(snapshotKey: string): void {
    const snapshotPath = extractDirectoryPathFromSnapshotKey(snapshotKey)
    if (!snapshotPath) {
      return
    }

    const existingPath = this.#snapshotPathByKey.get(snapshotKey)
    if (existingPath === snapshotPath) {
      return
    }
    if (existingPath) {
      this.remove(snapshotKey)
    }

    this.#snapshotPathByKey.set(snapshotKey, snapshotPath)
    addToSetMap(this.#keysByExactPath, snapshotPath, snapshotKey)

    if (snapshotPath === '.') {
      return
    }

    if (!this.#prefixIndexEnabled) {
      this.#maybeRebuildPrefixIndex()
      return
    }

    for (const prefix of getPathPrefixes(snapshotPath)) {
      addToSetMap(this.#keysByPrefixPath, prefix, snapshotKey)
    }

    this.#disablePrefixIndexIfOversized()
  }

  remove(snapshotKey: string): void {
    const snapshotPath = this.#snapshotPathByKey.get(snapshotKey)
    if (!snapshotPath) {
      return
    }

    this.#snapshotPathByKey.delete(snapshotKey)
    deleteFromSetMap(this.#keysByExactPath, snapshotPath, snapshotKey)

    if (snapshotPath === '.') {
      return
    }

    if (!this.#prefixIndexEnabled) {
      this.#maybeRebuildPrefixIndex()
      return
    }

    for (const prefix of getPathPrefixes(snapshotPath)) {
      deleteFromSetMap(this.#keysByPrefixPath, prefix, snapshotKey)
    }
  }

  clear(): void {
    this.#snapshotPathByKey.clear()
    this.#keysByExactPath.clear()
    this.#keysByPrefixPath.clear()
    this.#prefixIndexEnabled = true
  }

  getIntersectingKeys(path: string): Set<string> {
    if (path === '.') {
      return new Set(this.#snapshotPathByKey.keys())
    }

    if (!this.#prefixIndexEnabled) {
      this.#maybeRebuildPrefixIndex()
      if (!this.#prefixIndexEnabled) {
        return this.#scanIntersectingKeys(path)
      }
    }

    const intersectingKeys = new Set<string>()

    const descendantKeys = this.#keysByPrefixPath.get(path)
    if (descendantKeys) {
      for (const key of descendantKeys) {
        intersectingKeys.add(key)
      }
    }

    for (const ancestorPath of getPathAncestors(path)) {
      const ancestorKeys = this.#keysByExactPath.get(ancestorPath)
      if (!ancestorKeys) {
        continue
      }
      for (const key of ancestorKeys) {
        intersectingKeys.add(key)
      }
    }

    return intersectingKeys
  }

  #scanIntersectingKeys(path: string): Set<string> {
    const intersectingKeys = new Set<string>()
    for (const [snapshotKey, snapshotPath] of this.#snapshotPathByKey) {
      if (pathsIntersect(snapshotPath, path)) {
        intersectingKeys.add(snapshotKey)
      }
    }

    return intersectingKeys
  }

  #disablePrefixIndexIfOversized(): void {
    if (this.#keysByPrefixPath.size <= this.#maxPrefixKeys) {
      return
    }

    this.#keysByPrefixPath.clear()
    this.#prefixIndexEnabled = false
  }

  #maybeRebuildPrefixIndex(): void {
    if (this.#prefixIndexEnabled) {
      return
    }

    const rebuildThreshold = Math.floor(
      this.#maxPrefixKeys * this.#prefixIndexReenableRatio
    )
    if (this.#snapshotPathByKey.size > rebuildThreshold) {
      return
    }

    this.#keysByPrefixPath.clear()
    for (const [snapshotKey, snapshotPath] of this.#snapshotPathByKey) {
      if (snapshotPath === '.') {
        continue
      }

      for (const prefix of getPathPrefixes(snapshotPath)) {
        addToSetMap(this.#keysByPrefixPath, prefix, snapshotKey)
      }

      if (this.#keysByPrefixPath.size > this.#maxPrefixKeys) {
        this.#keysByPrefixPath.clear()
        this.#prefixIndexEnabled = false
        return
      }
    }

    this.#prefixIndexEnabled = true
  }
}

export function extractDirectoryPathFromSnapshotKey(
  key: string
): string | undefined {
  if (!key.startsWith('dir:')) {
    return undefined
  }

  const delimiterIndex = key.indexOf('|')
  const rawPath =
    delimiterIndex === -1
      ? key.slice('dir:'.length)
      : key.slice('dir:'.length, delimiterIndex)
  if (!rawPath) {
    return undefined
  }

  return normalizePathKey(rawPath)
}

export function getPathAncestors(path: string): string[] {
  if (path === '.' || path.length === 0) {
    return ['.']
  }

  const ancestors: string[] = []
  let current = path

  while (true) {
    ancestors.push(current)
    if (current === '.') {
      break
    }

    const separatorIndex = current.lastIndexOf('/')
    if (separatorIndex <= 0) {
      current = '.'
      continue
    }

    current = current.slice(0, separatorIndex)
  }

  return ancestors
}

function addToSetMap(
  map: Map<string, Set<string>>,
  key: string,
  value: string
): void {
  let entries = map.get(key)
  if (!entries) {
    entries = new Set<string>()
    map.set(key, entries)
  }
  entries.add(value)
}

function deleteFromSetMap(
  map: Map<string, Set<string>>,
  key: string,
  value: string
): void {
  const entries = map.get(key)
  if (!entries) {
    return
  }

  entries.delete(value)
  if (entries.size === 0) {
    map.delete(key)
  }
}

export function pathsIntersect(firstPath: string, secondPath: string): boolean {
  if (firstPath === '.' || secondPath === '.') {
    return true
  }

  return (
    firstPath === secondPath ||
    firstPath.startsWith(`${secondPath}/`) ||
    secondPath.startsWith(`${firstPath}/`)
  )
}

function getPathPrefixes(path: string): string[] {
  if (path === '.' || path.length === 0) {
    return []
  }

  const segments = path.split('/').filter((segment) => segment.length > 0)
  if (segments.length === 0) {
    return []
  }

  const prefixes: string[] = []
  let current = ''
  for (const segment of segments) {
    current = current.length > 0 ? `${current}/${segment}` : segment
    prefixes.push(current)
  }

  return prefixes
}
