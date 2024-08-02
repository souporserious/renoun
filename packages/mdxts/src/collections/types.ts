export type FilePatterns<Extension extends string = string> =
  | `${string}${Extension}`
  | `${string}${Extension}${string}`

export type SourceExports = Record<string, unknown>

export interface BaseSource {
  /**
   * The path to the source, taking into account the `baseDirectory` and
   * `basePath` configuration, and formatted to be URL-friendly.
   */
  getPath(): string

  /**
   * The path to the source on the local filesystem in development
   * and the git repository in production if configured.
   */
  getEditPath(): string
}

export interface BaseSourceWithGetters<Exports extends SourceExports>
  extends BaseSource {
  /** Retrieves a source in the directory by its path. */
  getSource(path: string | string[]): FileSystemSource<Exports> | undefined

  /** Retrieves all sources in the directory. */
  getSources(): FileSystemSource<Exports>[]
}

export interface ExportSource<Value> extends BaseSource {
  /** A text representation of the exported source if it is statically analyzable. */
  getText(): string

  /** The runtime value of the export. */
  getValue(): Promise<Value>

  /** The execution environment of the export source. */
  getEnvironment(): 'server' | 'client' | 'isomorphic' | 'unknown'

  /** The lines and columns where the export starts and ends. */
  getPosition(): {
    startLine: number
    startColumn: number
    endLine: number
    endColumn: number
  }
}

export interface DefaultExportSource<Value> extends ExportSource<Value> {
  /** The name of the source, which can be undefined for default exports. */
  getName(): string | undefined

  /** The name formatted as a title. */
  getTitle(): string | undefined
}

export interface NamedExportSource<Value> extends ExportSource<Value> {
  /** The name of the exported source. */
  getName(): string

  /** The name formatted as a title. */
  getTitle(): string
}

export interface FileSystemSource<Exports extends SourceExports>
  extends BaseSourceWithGetters<Exports> {
  /** The base file name or directory name. */
  getName(): string

  /** The name formatted as a title. */
  getTitle(): string

  /** Order of the source in the collection based on its position in the file system. */
  getOrder(): string

  /** Depth of source starting from the collection. */
  getDepth(): number

  /** Date the source was first created. */
  getCreatedAt(): Promise<Date | undefined>

  /** Date the source was last updated. */
  getUpdatedAt(): Promise<Date | undefined>

  /** Authors who have contributed to the source. */
  getAuthors(): Promise<string[]>

  /** The previous and next sources in the parent source if they exist. */
  getSiblings(): [
    previous?: FileSystemSource<Exports>,
    next?: FileSystemSource<Exports>,
  ]

  /** The default export source. */
  getDefaultExport(): DefaultExportSource<Exports['default']>

  /** A single named export source of the file. */
  getNamedExport<Name extends Exclude<keyof Exports, 'default'>>(
    name: Name
  ): NamedExportSource<Exports[Name]>

  /** All named export sources of the file. */
  getNamedExports(): NamedExportSource<Exports[keyof Exports]>[]
}

export type CollectionSource<Exports extends SourceExports> = {
  /** Get the configured collection title. */
  getTitle(): string | undefined
} & BaseSourceWithGetters<Exports>

export interface CollectionOptions {
  /** The title used for the collection when rendered for a page. */
  title?: string

  /** The label used for the collection when rendered as a navigation item. Defaults to the title. */
  label?: string

  /**
   * The base directory used when calculating source paths. This is useful in monorepos where
   * source files can be located outside of the workspace.
   */
  baseDirectory?: string

  /**
   * The base pathname used when calculating navigation paths. This includes everything after
   * the hostname (e.g. `/docs` in `https://mdxts.com/docs`).
   */
  basePath?: string

  /** The path to the TypeScript config file. */
  tsConfigFilePath?: string

  /** A custom sort function for ordering sources. */
  sort?: (a: string, b: string) => number
}
