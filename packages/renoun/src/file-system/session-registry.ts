import type { Snapshot, SnapshotContentIdOptions } from './Snapshot.ts'

function collectSnapshotFamily(
  snapshotId: string,
  parentMap: Map<string, string>
): Set<string> {
  const family = new Set<string>()
  const queue: string[] = [snapshotId]

  while (queue.length > 0) {
    const current = queue.shift()
    if (!current || family.has(current)) {
      continue
    }

    family.add(current)

    const parent = parentMap.get(current)
    if (parent) {
      queue.push(parent)
    }

    for (const [childId, childParentId] of parentMap) {
      if (childParentId === current) {
        queue.push(childId)
      }
    }
  }

  return family
}

export class GeneratedSnapshot implements Snapshot {
  readonly #base: Snapshot
  readonly id: string

  constructor(base: Snapshot, generation: number) {
    this.#base = base
    this.id = `${base.id}:g${generation}`
  }

  get baseSnapshotId(): string {
    return this.#base.id
  }

  readDirectory(path?: string) {
    return this.#base.readDirectory(path)
  }

  readFile(path: string) {
    return this.#base.readFile(path)
  }

  readFileBinary(path: string) {
    return this.#base.readFileBinary(path)
  }

  readFileStream(path: string) {
    return this.#base.readFileStream(path)
  }

  fileExists(path: string) {
    return this.#base.fileExists(path)
  }

  getFileLastModifiedMs(path: string) {
    return this.#base.getFileLastModifiedMs(path)
  }

  getFileByteLength(path: string) {
    return this.#base.getFileByteLength(path)
  }

  isFilePathGitIgnored(path: string) {
    return this.#base.isFilePathGitIgnored(path)
  }

  isFilePathExcludedFromTsConfigAsync(path: string, isDirectory?: boolean) {
    return this.#base.isFilePathExcludedFromTsConfigAsync(path, isDirectory)
  }

  getRelativePathToWorkspace(path: string): string {
    return this.#base.getRelativePathToWorkspace(path)
  }

  contentId(path: string, options?: SnapshotContentIdOptions) {
    return this.#base.contentId(path, options)
  }

  getWorkspaceChangeToken(rootPath: string): Promise<string | null> {
    const getter = this.#base.getWorkspaceChangeToken
    if (typeof getter !== 'function') {
      return Promise.resolve(null)
    }

    return getter.call(this.#base, rootPath)
  }

  getWorkspaceChangedPathsSinceToken(
    rootPath: string,
    previousToken: string
  ): Promise<ReadonlySet<string> | null> {
    const getter = this.#base.getWorkspaceChangedPathsSinceToken
    if (typeof getter !== 'function') {
      return Promise.resolve(null)
    }

    return getter.call(this.#base, rootPath, previousToken)
  }

  getRecentlyInvalidatedPaths(): ReadonlySet<string> | undefined {
    const getter = this.#base.getRecentlyInvalidatedPaths
    if (typeof getter !== 'function') {
      return undefined
    }

    return getter.call(this.#base)
  }

  invalidatePath(path: string) {
    this.#base.invalidatePath(path)
  }

  invalidatePaths(paths: Iterable<string>) {
    if (typeof this.#base.invalidatePaths === 'function') {
      this.#base.invalidatePaths(paths)
      return
    }

    for (const path of paths) {
      this.#base.invalidatePath(path)
    }
  }

  invalidateAll() {
    if (typeof this.#base.invalidateAll === 'function') {
      this.#base.invalidateAll()
      return
    }

    this.#base.invalidatePath('.')
  }

  onInvalidate(listener: (path: string) => void): () => void {
    return this.#base.onInvalidate(listener)
  }
}

interface GetOrCreateSessionOptions<SessionType> {
  snapshot?: Snapshot
  cacheId: string
  createBaseSnapshot: () => Snapshot
  createSession: (snapshot: Snapshot) => SessionType
}

interface ResetSessionsOptions<SessionType> {
  snapshotId?: string
  resetSession: (session: SessionType) => void
  onMissingSnapshotFamily?: (snapshotId: string) => void
}

export class SessionRegistry<SessionType> {
  readonly #sessionsByFileSystem = new WeakMap<
    object,
    Map<string, Map<string, SessionType>>
  >()
  readonly #snapshotGenerationByFileSystem = new WeakMap<object, number>()
  readonly #snapshotParentByFileSystem = new WeakMap<
    object,
    Map<string, string>
  >()

  getOrCreate(
    fileSystem: object,
    options: GetOrCreateSessionOptions<SessionType>
  ): SessionType {
    const generation = this.#snapshotGenerationByFileSystem.get(fileSystem) ?? 0
    const baseSnapshot = options.snapshot ?? options.createBaseSnapshot()
    const targetSnapshot =
      generation > 0
        ? new GeneratedSnapshot(baseSnapshot, generation)
        : baseSnapshot
    const sessionMap =
      this.#sessionsByFileSystem.get(fileSystem) ??
      new Map<string, Map<string, SessionType>>()
    const parentMap =
      this.#snapshotParentByFileSystem.get(fileSystem) ?? new Map<string, string>()

    if (!this.#sessionsByFileSystem.has(fileSystem)) {
      this.#sessionsByFileSystem.set(fileSystem, sessionMap)
    }
    if (!this.#snapshotParentByFileSystem.has(fileSystem)) {
      this.#snapshotParentByFileSystem.set(fileSystem, parentMap)
    }

    if (targetSnapshot instanceof GeneratedSnapshot) {
      parentMap.set(targetSnapshot.id, targetSnapshot.baseSnapshotId)
    }

    const cacheSessions =
      sessionMap.get(targetSnapshot.id) ?? new Map<string, SessionType>()
    const existing = cacheSessions.get(options.cacheId)
    if (existing) {
      return existing
    }

    const created = options.createSession(targetSnapshot)
    cacheSessions.set(options.cacheId, created)
    sessionMap.set(targetSnapshot.id, cacheSessions)
    return created
  }

  reset(
    fileSystem: object,
    options: ResetSessionsOptions<SessionType>
  ): void {
    const sessionMap = this.#sessionsByFileSystem.get(fileSystem)
    const parentMap = this.#snapshotParentByFileSystem.get(fileSystem)

    if (options.snapshotId) {
      if (!sessionMap || !parentMap) {
        return
      }

      const family = collectSnapshotFamily(options.snapshotId, parentMap)
      const familyEntries = Array.from(sessionMap.entries()).filter(([id]) =>
        family.has(id)
      )

      if (familyEntries.length === 0) {
        options.onMissingSnapshotFamily?.(options.snapshotId)
        return
      }

      this.#incrementGeneration(fileSystem)

      for (const [id, cacheSessions] of familyEntries) {
        for (const session of cacheSessions.values()) {
          options.resetSession(session)
        }
        sessionMap.delete(id)
        parentMap.delete(id)
      }

      if (sessionMap.size === 0) {
        this.#sessionsByFileSystem.delete(fileSystem)
        this.#snapshotParentByFileSystem.delete(fileSystem)
      }

      return
    }

    this.#incrementGeneration(fileSystem)

    if (!sessionMap) {
      return
    }

    for (const cacheSessions of sessionMap.values()) {
      for (const session of cacheSessions.values()) {
        options.resetSession(session)
      }
    }

    sessionMap.clear()
    this.#sessionsByFileSystem.delete(fileSystem)
    this.#snapshotParentByFileSystem.delete(fileSystem)
  }

  #incrementGeneration(fileSystem: object): void {
    const currentGeneration =
      this.#snapshotGenerationByFileSystem.get(fileSystem) ?? 0
    this.#snapshotGenerationByFileSystem.set(fileSystem, currentGeneration + 1)
  }
}

const cacheIdentityByCache = new WeakMap<object, string>()
let nextCacheIdentity = 0

export function getCacheIdentity(cache?: object): string {
  if (!cache) {
    return 'default'
  }

  const cached = cacheIdentityByCache.get(cache)
  if (cached) {
    return cached
  }

  nextCacheIdentity += 1
  const identity = `cache-${nextCacheIdentity}`
  cacheIdentityByCache.set(cache, identity)
  return identity
}
