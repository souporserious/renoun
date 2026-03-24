import { PROCESS_ENV_KEYS } from '../utils/env-keys.ts'
import { parseBooleanProcessEnv } from '../utils/env.ts'

export interface DirectorySnapshotDirectoryMetadata<
  DirectoryType extends Entry = any,
  Entry = unknown,
> {
  hasVisibleDescendant: boolean
  materializedEntries: Entry[]
  snapshot?: DirectorySnapshot<DirectoryType, Entry>
}

export interface PersistedDirectoryFileEntry {
  kind: 'file'
  path: string
  byteLength?: number
}

export interface PersistedDirectoryDirectoryEntry {
  kind: 'directory'
  path: string
  snapshot: PersistedDirectorySnapshotV1
}

export type PersistedDirectoryEntry =
  | PersistedDirectoryFileEntry
  | PersistedDirectoryDirectoryEntry

export interface PersistedDirectoryFlatEntry {
  kind: 'file' | 'directory'
  path: string
}

export interface PersistedDirectorySnapshotV1 {
  version: 2
  path: string
  hasVisibleDescendant: boolean
  shouldIncludeSelf: boolean
  lastValidatedAt: number
  filterSignature: string
  sortSignature: string
  workspaceChangeToken?: string | null
  dependencySignatures: Array<[string, string]>
  entries: PersistedDirectoryEntry[]
  flatEntries: PersistedDirectoryFlatEntry[]
}

export interface DirectorySnapshotRestoreFactory<DirectoryType, Entry> {
  createDirectory(path: string): DirectoryType
  createFile(path: string, options?: { byteLength?: number }): Entry
}

export type PersistedEntryMetadata<
  DirectoryType extends Entry,
  Entry = unknown,
> =
  | {
      kind: 'file'
      path: string
      byteLength?: number
      entry: Entry
    }
  | {
      kind: 'directory'
      path: string
      entry: DirectoryType
      snapshot: DirectorySnapshot<DirectoryType, Entry>
    }

interface PersistedSnapshotRestoreResult<DirectoryType extends Entry, Entry> {
  snapshot: DirectorySnapshot<DirectoryType, Entry>
  restoredEntriesByKey: Map<string, Entry>
}

function createPersistedEntryKey(kind: 'file' | 'directory', path: string) {
  return `${kind}:${path}`
}

function shouldDebugSnapshotRestoreMismatch(): boolean {
  return (
    parseBooleanProcessEnv(PROCESS_ENV_KEYS.renounDebugDirectorySnapshotRestore) ===
    true
  )
}

function createLazyDirectoryMetadata<DirectoryType extends Entry, Entry>(options: {
  hasVisibleDescendant: boolean
  getMaterializedEntries: () => Entry[]
  getSnapshot?: () => DirectorySnapshot<DirectoryType, Entry>
}): DirectorySnapshotDirectoryMetadata<DirectoryType, Entry> {
  let materializedEntries: Entry[] | undefined
  let snapshot: DirectorySnapshot<DirectoryType, Entry> | undefined

  return {
    hasVisibleDescendant: options.hasVisibleDescendant,
    get materializedEntries() {
      if (!materializedEntries) {
        materializedEntries = options.getMaterializedEntries()
      }

      return materializedEntries
    },
    get snapshot() {
      if (!options.getSnapshot) {
        return undefined
      }

      if (!snapshot) {
        snapshot = options.getSnapshot()
      }

      return snapshot
    },
  }
}

export class DirectorySnapshot<DirectoryType extends Entry, Entry = unknown> {
  #entries: Entry[]
  #directories: Map<
    DirectoryType,
    DirectorySnapshotDirectoryMetadata<DirectoryType, Entry>
  >
  #materialized?: Entry[]
  #materializedEntriesFactory?: () => Entry[]
  #dependencies?: Map<string, string>
  #lastValidatedAt: number
  #path: string
  #filterSignature: string
  #sortSignature: string
  #workspaceChangeToken?: string | null
  #persistedEntries?: PersistedEntryMetadata<DirectoryType, Entry>[]

  constructor(options: {
    entries: Entry[]
    directories: Map<
      DirectoryType,
      DirectorySnapshotDirectoryMetadata<DirectoryType, Entry>
    >
    shouldIncludeSelf: boolean
    hasVisibleDescendant: boolean
    dependencies?: Map<string, string>
    lastValidatedAt?: number
    path: string
    filterSignature?: string
    sortSignature?: string
    workspaceChangeToken?: string | null
    materializedEntriesFactory?: () => Entry[]
    persistedEntries?: PersistedEntryMetadata<DirectoryType, Entry>[]
  }) {
    this.#entries = options.entries
    this.#directories = options.directories
    this.shouldIncludeSelf = options.shouldIncludeSelf
    this.hasVisibleDescendant = options.hasVisibleDescendant
    this.#dependencies = options.dependencies
    this.#lastValidatedAt = options.lastValidatedAt ?? Date.now()
    this.#path = options.path
    this.#filterSignature = options.filterSignature ?? ''
    this.#sortSignature = options.sortSignature ?? ''
    this.#workspaceChangeToken = options.workspaceChangeToken
    this.#materializedEntriesFactory = options.materializedEntriesFactory
    this.#persistedEntries = options.persistedEntries
  }

  readonly shouldIncludeSelf: boolean
  hasVisibleDescendant: boolean

  materialize(): Entry[] {
    if (!this.#materialized) {
      const materializedEntries = this.#materializedEntriesFactory
        ? this.#materializedEntriesFactory()
        : this.#entries

      this.#materialized = materializedEntries.slice()
      this.#materializedEntriesFactory = undefined
    }

    return this.#materialized
  }

  getDirectoryMetadata(
    directory: DirectoryType
  ): DirectorySnapshotDirectoryMetadata<DirectoryType, Entry> | undefined {
    return this.#directories.get(directory)
  }

  getDependencies(): Map<string, string> | undefined {
    return this.#dependencies
  }

  getLastValidatedAt(): number {
    return this.#lastValidatedAt
  }

  getWorkspaceChangeToken(): string | null | undefined {
    return this.#workspaceChangeToken
  }

  setWorkspaceChangeToken(token: string | null | undefined): void {
    this.#workspaceChangeToken = token
  }

  toPersistedSnapshot(): PersistedDirectorySnapshotV1 {
    if (!this.#persistedEntries) {
      throw new Error(
        '[renoun] Cannot serialize a DirectorySnapshot without persisted entry metadata.'
      )
    }

    const entryLookup = new Map<unknown, PersistedDirectoryFlatEntry>()
    const collectPersistedEntries = (
      entries: PersistedEntryMetadata<DirectoryType, Entry>[]
    ) => {
      for (const entry of entries) {
        entryLookup.set(entry.entry, {
          kind: entry.kind,
          path: entry.path,
        })

        if (entry.kind === 'directory') {
          const childPersistedEntries = entry.snapshot.#persistedEntries
          if (childPersistedEntries) {
            collectPersistedEntries(childPersistedEntries)
          }
        }
      }
    }

    collectPersistedEntries(this.#persistedEntries)

    const flatEntries: PersistedDirectoryFlatEntry[] = []
    for (const entry of this.materialize()) {
      const persistedEntry = entryLookup.get(entry)
      if (!persistedEntry) {
        throw new Error(
          '[renoun] Failed to serialize DirectorySnapshot materialized entries.'
        )
      }

      flatEntries.push({
        kind: persistedEntry.kind,
        path: persistedEntry.path,
      })
    }

    return {
      version: 2,
      path: this.#path,
      shouldIncludeSelf: this.shouldIncludeSelf,
      hasVisibleDescendant: this.hasVisibleDescendant,
      lastValidatedAt: this.#lastValidatedAt,
      filterSignature: this.#filterSignature,
      sortSignature: this.#sortSignature,
      workspaceChangeToken: this.#workspaceChangeToken,
      dependencySignatures: this.#dependencies
        ? Array.from(this.#dependencies.entries()).sort((first, second) =>
            first[0].localeCompare(second[0])
          )
        : [],
      entries: this.#persistedEntries.map((entry) => {
        if (entry.kind === 'file') {
          return {
            kind: 'file',
            path: entry.path,
            byteLength: entry.byteLength,
          }
        }

        return {
          kind: 'directory',
          path: entry.path,
          snapshot: entry.snapshot.toPersistedSnapshot(),
        }
      }),
      flatEntries,
    }
  }

  static fromPersistedSnapshot<DirectoryType extends Entry, Entry = unknown>(
    payload: PersistedDirectorySnapshotV1,
    factory: DirectorySnapshotRestoreFactory<DirectoryType, Entry>
  ): DirectorySnapshot<DirectoryType, Entry> {
    const restored = this.restorePersistedSnapshot(payload, factory)
    return restored.snapshot
  }

  private static restorePersistedSnapshot<
    DirectoryType extends Entry,
    Entry = unknown,
  >(
    payload: PersistedDirectorySnapshotV1,
    factory: DirectorySnapshotRestoreFactory<DirectoryType, Entry>
  ): PersistedSnapshotRestoreResult<DirectoryType, Entry> {
    const immediateEntries: Entry[] = []
    const directories = new Map<
      DirectoryType,
      DirectorySnapshotDirectoryMetadata<DirectoryType, Entry>
    >()
    const persistedEntries: PersistedEntryMetadata<DirectoryType, Entry>[] = []
    const restoredEntriesByKey = new Map<string, Entry>()
    const childRestorers: Array<
      () => PersistedSnapshotRestoreResult<DirectoryType, Entry>
    > = []

    for (const entry of payload.entries) {
      if (entry.kind === 'file') {
        const restoredFile = factory.createFile(entry.path, {
          byteLength: entry.byteLength,
        })
        immediateEntries.push(restoredFile)
        persistedEntries.push({
          kind: 'file',
          path: entry.path,
          byteLength: entry.byteLength,
          entry: restoredFile,
        })
        restoredEntriesByKey.set(
          createPersistedEntryKey('file', entry.path),
          restoredFile
        )
        continue
      }

      const restoredDirectory = factory.createDirectory(entry.path)
      let childRestored:
        | PersistedSnapshotRestoreResult<DirectoryType, Entry>
        | undefined
      const getChildRestored = () => {
        if (!childRestored) {
          childRestored = this.restorePersistedSnapshot(entry.snapshot, factory)
        }

        return childRestored
      }

      childRestorers.push(getChildRestored)

      directories.set(
        restoredDirectory,
        createLazyDirectoryMetadata({
          hasVisibleDescendant: entry.snapshot.hasVisibleDescendant,
          getMaterializedEntries: () => getChildRestored().snapshot.materialize(),
          getSnapshot: () => getChildRestored().snapshot,
        })
      )

      immediateEntries.push(restoredDirectory)
      persistedEntries.push({
        kind: 'directory',
        path: entry.path,
        entry: restoredDirectory,
        get snapshot() {
          return getChildRestored().snapshot
        },
      })
      restoredEntriesByKey.set(
        createPersistedEntryKey('directory', entry.path),
        restoredDirectory
      )
    }

    let nestedEntriesRestored = false
    const restoreNestedEntries = () => {
      if (nestedEntriesRestored) {
        return
      }

      nestedEntriesRestored = true

      for (const getChildRestored of childRestorers) {
        const restoredChild = getChildRestored()
        restoredChild.snapshot.materialize()

        for (const [childKey, childEntry] of restoredChild.restoredEntriesByKey) {
          restoredEntriesByKey.set(childKey, childEntry)
        }
      }
    }

    const buildMaterializedEntries = () => {
      restoreNestedEntries()

      const materializedEntries: Entry[] = []

      for (const entry of payload.flatEntries) {
        const restoredEntry = restoredEntriesByKey.get(
          createPersistedEntryKey(entry.kind, entry.path)
        )

        if (restoredEntry) {
          materializedEntries.push(restoredEntry as Entry)
        }
      }

      return materializedEntries
    }

    const materializedEntries = () => buildMaterializedEntries()

    if (shouldDebugSnapshotRestoreMismatch()) {
      const restoredMaterializedEntries = buildMaterializedEntries()

      if (restoredMaterializedEntries.length !== payload.flatEntries.length) {
        const missingEntries = payload.flatEntries
          .map((entry) => ({
            kind: entry.kind,
            path: entry.path,
            found: !!restoredEntriesByKey.get(
              createPersistedEntryKey(entry.kind, entry.path)
            ),
          }))
          .filter((entry) => !entry.found)

        console.log(
          '[snapshot-restore-mismatch]',
          JSON.stringify({
            snapshotPath: payload.path,
            entriesLength: payload.entries.length,
            flatEntriesLength: payload.flatEntries.length,
            materializedLength: restoredMaterializedEntries.length,
            missingEntries,
          })
        )
      }
    }

    const snapshot = createDirectorySnapshot<DirectoryType, Entry>({
      entries: immediateEntries,
      directories,
      shouldIncludeSelf: payload.shouldIncludeSelf,
      hasVisibleDescendant: payload.hasVisibleDescendant,
      dependencies: new Map(payload.dependencySignatures),
      lastValidatedAt: payload.lastValidatedAt,
      path: payload.path,
      filterSignature: payload.filterSignature,
      sortSignature: payload.sortSignature,
      workspaceChangeToken: payload.workspaceChangeToken,
      materializedEntriesFactory:
        payload.flatEntries.length > immediateEntries.length
          ? materializedEntries
          : undefined,
      persistedEntries,
    })

    return {
      snapshot,
      restoredEntriesByKey,
    }
  }

  markValidated(timestamp = Date.now()): void {
    this.#lastValidatedAt = timestamp
  }
}

export function isPersistedDirectorySnapshotV1(
  value: unknown
): value is PersistedDirectorySnapshotV1 {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Record<string, unknown>
  if (
    (candidate['version'] !== 1 && candidate['version'] !== 2) ||
    typeof candidate['path'] !== 'string' ||
    typeof candidate['hasVisibleDescendant'] !== 'boolean' ||
    typeof candidate['shouldIncludeSelf'] !== 'boolean' ||
    typeof candidate['lastValidatedAt'] !== 'number' ||
    typeof candidate['filterSignature'] !== 'string' ||
    typeof candidate['sortSignature'] !== 'string'
  ) {
    return false
  }

  const workspaceChangeToken = candidate['workspaceChangeToken']
  if (
    workspaceChangeToken !== undefined &&
    workspaceChangeToken !== null &&
    typeof workspaceChangeToken !== 'string'
  ) {
    return false
  }

  const dependencySignatures = candidate['dependencySignatures']
  const entries = candidate['entries']
  const flatEntries = candidate['flatEntries']
  if (
    !Array.isArray(dependencySignatures) ||
    !Array.isArray(entries) ||
    !Array.isArray(flatEntries)
  ) {
    return false
  }

  for (const dependency of dependencySignatures) {
    if (!Array.isArray(dependency) || dependency.length !== 2) {
      return false
    }

    const candidatePath = dependency[0]
    const candidateSignature = dependency[1]
    if (
      typeof candidatePath !== 'string' ||
      typeof candidateSignature !== 'string'
    ) {
      return false
    }
  }

  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') {
      return false
    }

    const typedEntry = entry as Record<string, unknown>
    if (typedEntry['kind'] !== 'file' && typedEntry['kind'] !== 'directory') {
      return false
    }

    if (typeof typedEntry['path'] !== 'string') {
      return false
    }

    if (
      typedEntry['kind'] === 'file' &&
      typedEntry['byteLength'] !== undefined &&
      (typeof typedEntry['byteLength'] !== 'number' ||
        !Number.isFinite(typedEntry['byteLength']) ||
        typedEntry['byteLength'] < 0)
    ) {
      return false
    }

    if (
      typedEntry['kind'] === 'directory' &&
      !isPersistedDirectorySnapshotV1(typedEntry['snapshot'])
    ) {
      return false
    }
  }

  for (const entry of flatEntries) {
    if (!entry || typeof entry !== 'object') {
      return false
    }

    const typedEntry = entry as Record<string, unknown>
    if (typedEntry['kind'] !== 'file' && typedEntry['kind'] !== 'directory') {
      return false
    }

    if (typeof typedEntry['path'] !== 'string') {
      return false
    }
  }

  return true
}

export function createDirectorySnapshot<
  DirectoryType extends Entry,
  Entry = unknown,
>(options: {
  entries: Entry[]
  directories?: Map<
    DirectoryType,
    DirectorySnapshotDirectoryMetadata<DirectoryType, Entry>
  >
  shouldIncludeSelf: boolean
  hasVisibleDescendant: boolean
  dependencies?: Map<string, string>
  lastValidatedAt?: number
  path?: string
  filterSignature?: string
  sortSignature?: string
  workspaceChangeToken?: string | null
  materializedEntriesFactory?: () => Entry[]
  persistedEntries?: PersistedEntryMetadata<DirectoryType, Entry>[]
}): DirectorySnapshot<DirectoryType, Entry> {
  return new DirectorySnapshot<DirectoryType, Entry>({
    entries: options.entries,
    directories:
      options.directories ??
      new Map<
        DirectoryType,
        DirectorySnapshotDirectoryMetadata<DirectoryType, Entry>
      >(),
    shouldIncludeSelf: options.shouldIncludeSelf,
    hasVisibleDescendant: options.hasVisibleDescendant,
    dependencies: options.dependencies,
    lastValidatedAt: options.lastValidatedAt,
    path: options.path ?? '',
    filterSignature: options.filterSignature,
    sortSignature: options.sortSignature,
    workspaceChangeToken: options.workspaceChangeToken,
    materializedEntriesFactory: options.materializedEntriesFactory,
    persistedEntries: options.persistedEntries,
  })
}
