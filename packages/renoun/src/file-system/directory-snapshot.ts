export interface DirectorySnapshotDirectoryMetadata<Entry = unknown> {
  hasVisibleDescendant: boolean
  materializedEntries: Entry[]
}

export class DirectorySnapshot<DirectoryType = unknown, Entry = unknown> {
  #entries: Entry[]
  #directories: Map<DirectoryType, DirectorySnapshotDirectoryMetadata<Entry>>
  #materialized?: Entry[]
  #dependencies?: Map<string, string>
  #lastValidatedAt: number

  constructor(options: {
    entries: Entry[]
    directories: Map<DirectoryType, DirectorySnapshotDirectoryMetadata<Entry>>
    shouldIncludeSelf: boolean
    hasVisibleDescendant: boolean
    dependencies?: Map<string, string>
    lastValidatedAt?: number
  }) {
    this.#entries = options.entries
    this.#directories = options.directories
    this.shouldIncludeSelf = options.shouldIncludeSelf
    this.hasVisibleDescendant = options.hasVisibleDescendant
    this.#dependencies = options.dependencies
    this.#lastValidatedAt = options.lastValidatedAt ?? Date.now()
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

  markValidated(timestamp = Date.now()): void {
    this.#lastValidatedAt = timestamp
  }
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
  })
}
