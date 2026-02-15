export interface DirectorySnapshotDirectoryMetadata<Entry = unknown> {
  hasVisibleDescendant: boolean
  materializedEntries: Entry[]
}

export interface PersistedDirectoryFileEntry {
  kind: 'file'
  path: string
}

export interface PersistedDirectoryDirectoryEntry {
  kind: 'directory'
  path: string
  snapshot: PersistedDirectorySnapshotV1
}

export type PersistedDirectoryEntry =
  | PersistedDirectoryFileEntry
  | PersistedDirectoryDirectoryEntry

export interface PersistedDirectorySnapshotV1 {
  version: 1
  path: string
  hasVisibleDescendant: boolean
  shouldIncludeSelf: boolean
  lastValidatedAt: number
  filterSignature: string
  sortSignature: string
  dependencySignatures: Array<[string, string]>
  entries: PersistedDirectoryEntry[]
}

export interface DirectorySnapshotRestoreFactory<DirectoryType, Entry> {
  createDirectory(path: string): DirectoryType
  createFile(path: string): Entry
}

export type PersistedEntryMetadata<DirectoryType, Entry> =
  | {
  kind: 'file'
  path: string
  entry: Entry
  }
  | {
  kind: 'directory'
  path: string
  entry: DirectoryType
  snapshot: DirectorySnapshot<DirectoryType, Entry>
  }

export class DirectorySnapshot<DirectoryType = unknown, Entry = unknown> {
  #entries: Entry[]
  #directories: Map<DirectoryType, DirectorySnapshotDirectoryMetadata<Entry>>
  #materialized?: Entry[]
  #dependencies?: Map<string, string>
  #lastValidatedAt: number
  #path: string
  #filterSignature: string
  #sortSignature: string
  #persistedEntries?: PersistedEntryMetadata<DirectoryType, Entry>[]

  constructor(options: {
    entries: Entry[]
    directories: Map<DirectoryType, DirectorySnapshotDirectoryMetadata<Entry>>
    shouldIncludeSelf: boolean
    hasVisibleDescendant: boolean
    dependencies?: Map<string, string>
    lastValidatedAt?: number
    path: string
    filterSignature?: string
    sortSignature?: string
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
    this.#persistedEntries = options.persistedEntries
  }

  readonly shouldIncludeSelf: boolean
  hasVisibleDescendant: boolean

  materialize(): Entry[] {
    if (!this.#materialized) {
      this.#materialized = this.#entries.slice()
    }

    return this.#materialized
  }

  getDirectoryMetadata(
    directory: DirectoryType
  ): DirectorySnapshotDirectoryMetadata<Entry> | undefined {
    return this.#directories.get(directory)
  }

  getDependencies(): Map<string, string> | undefined {
    return this.#dependencies
  }

  getLastValidatedAt(): number {
    return this.#lastValidatedAt
  }

  toPersistedSnapshot(): PersistedDirectorySnapshotV1 {
    if (!this.#persistedEntries) {
      throw new Error(
        '[renoun] Cannot serialize a DirectorySnapshot without persisted entry metadata.'
      )
    }

    return {
      version: 1,
      path: this.#path,
      shouldIncludeSelf: this.shouldIncludeSelf,
      hasVisibleDescendant: this.hasVisibleDescendant,
      lastValidatedAt: this.#lastValidatedAt,
      filterSignature: this.#filterSignature,
      sortSignature: this.#sortSignature,
      dependencySignatures: this.#dependencies
        ? Array.from(this.#dependencies.entries())
        : [],
      entries: this.#persistedEntries.map((entry) => {
        if (entry.kind === 'file') {
          return {
            kind: 'file',
            path: entry.path,
          }
        }

        return {
          kind: 'directory',
          path: entry.path,
          snapshot: entry.snapshot.toPersistedSnapshot(),
        }
      }),
    }
  }

  static fromPersistedSnapshot<
    Entry = unknown,
    DirectoryType extends Entry = Entry,
  >(
    payload: PersistedDirectorySnapshotV1,
    factory: DirectorySnapshotRestoreFactory<DirectoryType, Entry>
  ): DirectorySnapshot<DirectoryType, Entry> {
    const entries: Entry[] = []
    const directories = new Map<DirectoryType, DirectorySnapshotDirectoryMetadata<Entry>>()
    const persistedEntries: PersistedEntryMetadata<DirectoryType, Entry>[] = []

    for (const entry of payload.entries) {
      if (entry.kind === 'file') {
        const restoredFile = factory.createFile(entry.path)
        entries.push(restoredFile)
        persistedEntries.push({ kind: 'file', path: entry.path, entry: restoredFile })
        continue
      }

      const childSnapshot = this.fromPersistedSnapshot(entry.snapshot, factory)
      const restoredDirectory = factory.createDirectory(entry.path)

      directories.set(restoredDirectory, {
        hasVisibleDescendant: childSnapshot.hasVisibleDescendant,
        materializedEntries: childSnapshot.materialize(),
      })

      entries.push(restoredDirectory)
      persistedEntries.push({
        kind: 'directory',
        path: entry.path,
        entry: restoredDirectory,
        snapshot: childSnapshot,
      })
    }

    return createDirectorySnapshot<DirectoryType, Entry>({
      entries,
      directories,
      shouldIncludeSelf: payload.shouldIncludeSelf,
      hasVisibleDescendant: payload.hasVisibleDescendant,
      dependencies: new Map(payload.dependencySignatures),
      lastValidatedAt: payload.lastValidatedAt,
      path: payload.path,
      filterSignature: payload.filterSignature,
      sortSignature: payload.sortSignature,
      persistedEntries,
    })
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

  const candidate = value as Partial<PersistedDirectorySnapshotV1>
  if (
    candidate.version !== 1 ||
    typeof candidate.path !== 'string' ||
    typeof candidate.hasVisibleDescendant !== 'boolean' ||
    typeof candidate.shouldIncludeSelf !== 'boolean' ||
    typeof candidate.lastValidatedAt !== 'number' ||
    typeof candidate.filterSignature !== 'string' ||
    typeof candidate.sortSignature !== 'string'
  ) {
    return false
  }

  const dependencySignatures = candidate.dependencySignatures
  const entries = candidate.entries
  if (!Array.isArray(dependencySignatures) || !Array.isArray(entries)) {
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

    const typedEntry = entry as PersistedDirectoryEntry
    if (
      typedEntry.kind !== 'file' &&
      typedEntry.kind !== 'directory'
    ) {
      return false
    }

    if (typeof typedEntry.path !== 'string') {
      return false
    }

    if (typedEntry.kind === 'directory' &&
      !isPersistedDirectorySnapshotV1(typedEntry.snapshot)
    ) {
      return false
    }
  }

  return true
}

export function createDirectorySnapshot<
  DirectoryType = unknown,
  Entry = unknown,
>(options: {
  entries: Entry[]
  directories?: Map<DirectoryType, DirectorySnapshotDirectoryMetadata<Entry>>
  shouldIncludeSelf: boolean
  hasVisibleDescendant: boolean
  dependencies?: Map<string, string>
  lastValidatedAt?: number
  path?: string
  filterSignature?: string
  sortSignature?: string
  persistedEntries?: PersistedEntryMetadata<DirectoryType, Entry>[]
}): DirectorySnapshot<DirectoryType, Entry> {
  return new DirectorySnapshot<DirectoryType, Entry>({
    entries: options.entries,
    directories:
      options.directories ??
      new Map<DirectoryType, DirectorySnapshotDirectoryMetadata<Entry>>(),
    shouldIncludeSelf: options.shouldIncludeSelf,
    hasVisibleDescendant: options.hasVisibleDescendant,
    dependencies: options.dependencies,
    lastValidatedAt: options.lastValidatedAt,
    path: options.path ?? '',
    filterSignature: options.filterSignature,
    sortSignature: options.sortSignature,
    persistedEntries: options.persistedEntries,
  })
}
