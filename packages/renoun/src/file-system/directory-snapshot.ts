import type { Directory, FileSystemEntry } from './index'

export interface DirectorySnapshotDirectoryMetadata<
  LoaderTypes extends Record<string, any>,
> {
  hasVisibleDescendant: boolean
  materializedEntries: FileSystemEntry<LoaderTypes>[]
}

export class DirectorySnapshot<LoaderTypes extends Record<string, any>> {
  #entries: FileSystemEntry<LoaderTypes>[]
  #directories: Map<
    Directory<LoaderTypes>,
    DirectorySnapshotDirectoryMetadata<LoaderTypes>
  >
  #materialized?: FileSystemEntry<LoaderTypes>[]
  #dependencies?: Map<string, number>

  constructor(options: {
    entries: FileSystemEntry<LoaderTypes>[]
    directories: Map<
      Directory<LoaderTypes>,
      DirectorySnapshotDirectoryMetadata<LoaderTypes>
    >
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

  materialize(): FileSystemEntry<LoaderTypes>[] {
    if (!this.#materialized) {
      this.#materialized = this.#entries.slice()
    }

    return this.#materialized
  }

  getDirectoryMetadata(
    directory: Directory<LoaderTypes>
  ): DirectorySnapshotDirectoryMetadata<LoaderTypes> | undefined {
    return this.#directories.get(directory)
  }

  getDependencies(): Map<string, number> | undefined {
    return this.#dependencies
  }
}

export function createDirectorySnapshot<
  LoaderTypes extends Record<string, any>,
>(options: {
  entries: FileSystemEntry<LoaderTypes>[]
  directories?: Map<
    Directory<LoaderTypes>,
    DirectorySnapshotDirectoryMetadata<LoaderTypes>
  >
  shouldIncludeSelf: boolean
  hasVisibleDescendant: boolean
  dependencies?: Map<string, number>
}): DirectorySnapshot<LoaderTypes> {
  return new DirectorySnapshot({
    entries: options.entries,
    directories:
      options.directories ??
      new Map<
        Directory<LoaderTypes>,
        DirectorySnapshotDirectoryMetadata<LoaderTypes>
      >(),
    shouldIncludeSelf: options.shouldIncludeSelf,
    hasVisibleDescendant: options.hasVisibleDescendant,
    dependencies: options.dependencies,
  })
}
