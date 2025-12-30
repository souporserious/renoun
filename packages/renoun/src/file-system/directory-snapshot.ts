export interface DirectorySnapshotDirectoryMetadata<Entry = unknown> {
  hasVisibleDescendant: boolean
  materializedEntries: Entry[]
}

export class DirectorySnapshot<DirectoryType = unknown, Entry = unknown> {
  #entries: Entry[]
  #directories: Map<DirectoryType, DirectorySnapshotDirectoryMetadata<Entry>>
  #materialized?: Entry[]
  #dependencies?: Map<string, number>

  constructor(options: {
    entries: Entry[]
    directories: Map<DirectoryType, DirectorySnapshotDirectoryMetadata<Entry>>
    shouldIncludeSelf: boolean
    hasVisibleDescendant: boolean
    dependencies?: Map<string, number>
  }) {
    this.#entries = options.entries
    this.#directories = options.directories
    this.shouldIncludeSelf = options.shouldIncludeSelf
    this.hasVisibleDescendant = options.hasVisibleDescendant
    this.#dependencies = options.dependencies
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

  getDependencies(): Map<string, number> | undefined {
    return this.#dependencies
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
  dependencies?: Map<string, number>
}): DirectorySnapshot<DirectoryType, Entry> {
  return new DirectorySnapshot<DirectoryType, Entry>({
    entries: options.entries,
    directories:
      options.directories ??
      new Map<DirectoryType, DirectorySnapshotDirectoryMetadata<Entry>>(),
    shouldIncludeSelf: options.shouldIncludeSelf,
    hasVisibleDescendant: options.hasVisibleDescendant,
    dependencies: options.dependencies,
  })
}
