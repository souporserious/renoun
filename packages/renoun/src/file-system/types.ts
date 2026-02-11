export type { ContentSection } from '@renoun/mdx'

import type { Kind } from '../utils/resolve-type.ts'
import type { PackageManagerName } from './PackageManager.ts'

/** Represents a Git author with commit statistics. */
export interface GitAuthor {
  name: string
  email?: string
  commitCount: number
  firstCommitDate?: Date
  lastCommitDate?: Date
}

/** Aggregated git metadata for a path. */
export interface GitMetadata {
  authors: GitAuthor[]
  firstCommitDate?: Date
  lastCommitDate?: Date
}

/** Metadata for a single export within a module. */
export interface GitExportMetadata {
  firstCommitDate?: Date
  lastCommitDate?: Date
  firstCommitHash?: string
  lastCommitHash?: string
}

/** Query options for getting export metadata. */
export interface GitExportMetadataQuery {
  exportName?: string
  exportPath?: string[]
}

/** Base metadata shared by file and module metadata. */
export interface GitBaseMetadata {
  path: string
  ref: string
  refCommit: string
  firstCommitDate?: string
  lastCommitDate?: string
  firstCommitHash?: string
  lastCommitHash?: string
  authors: GitAuthor[]
}

/** Git metadata for a non-module file. */
export interface GitFileMetadata extends GitBaseMetadata {
  kind: 'file'
}

/** Git metadata for a module file with export-level metadata. */
export interface GitModuleMetadata extends GitBaseMetadata {
  kind: 'module'
  exports: Record<string, GitExportMetadata>
}

/** Union of file and module metadata types. */
export type GitPathMetadata = GitFileMetadata | GitModuleMetadata

/** Kind of metadata to retrieve for a path. */
export type GitPathMetadataKind = 'auto' | 'file' | 'module'

interface ExportHistoryBaseOptions {
  entry?: string | string[]
  limit?: number
  maxDepth?: number
  detectUpdates?: boolean
  updateMode?: 'body' | 'signature'
}

/** Options for getting export history. */
export interface ExportHistoryOptions extends ExportHistoryBaseOptions {
  /**
   * Ref selector used to scope history processing.
   *
   * - `'<tag>'`: if the tag exists, uses release-window mode (previous tag -> tag)
   * - `'latest'`: most recent release-window mode
   * - `'<branch|sha>'`: analyze history up to that ref
   * - `{ start, end }`: explicit range (both optional, but at least one required)
   */
  ref?:
    | string
    | {
        start: string
        end?: string
      }
    | {
        start?: string
        end: string
      }
}

/** Base properties shared by all export change types. */
interface BaseChange {
  /** The SHA of the commit. */
  sha: string

  /** The Unix timestamp of the commit. */
  unix: number

  /** The date of the commit. */
  date: string

  /** The release of the commit. */
  release?: string

  /** The exported name of the symbol. */
  name: string

  /** The local declaration name when it differs from the export name (e.g. "NodeBuilder" for `export default class NodeBuilder`). */
  localName?: string

  /** The file path where the export is defined. */
  filePath: string

  /** The ID of the export (format: "path/to/file.ts::exportName"). */
  id: string
}

/** Change indicating an export was added. */
export interface AddedChange extends BaseChange {
  kind: 'Added'
}

/** Change indicating an export was updated. */
export interface UpdatedChange extends BaseChange {
  kind: 'Updated'
  /** Whether the signature changed (vs only the body). */
  signature: boolean
}

/** Change indicating an export was renamed. */
export interface RenamedChange extends BaseChange {
  kind: 'Renamed'
  /** The previous export name, if it changed. */
  previousName?: string
  /** The previous file path, if the export moved files. */
  previousFilePath?: string
  /** The previous export ID. */
  previousId: string
}

/** Change indicating an export was removed. */
export interface RemovedChange extends BaseChange {
  kind: 'Removed'
}

/** Change indicating an export was deprecated. */
export interface DeprecatedChange extends BaseChange {
  kind: 'Deprecated'
  /** The deprecation message, if provided. */
  message?: string
}

/** Union of all export change types. */
export type ExportChange =
  | AddedChange
  | UpdatedChange
  | RenamedChange
  | RemovedChange
  | DeprecatedChange

/** Serializable export snapshot used for incremental history resumption. */
export interface SerializedExportItem {
  name: string
  localName?: string
  sourceName?: string
  id: string
  bodyHash: string
  signatureHash: string
  signatureText: string
  startLine?: number
  endLine?: number
  deprecated?: true
  deprecatedMessage?: string
}

/**
 * Report of export history across commits.
 *
 * The following criteria is used to identify an export across commits:
 * - ID is the ultimate defining symbol location when resolvable
 * - Format: "path/to/file.ts::exportName"
 * - Re-exports resolve to their source; local exports use defining file
 * - Same ID across commits = same underlying symbol (enables rename detection)
 */
export interface ExportHistoryReport {
  generatedAt: string
  repo: string
  entryFiles: string[]
  exports: Record<string, ExportChange[]>
  nameToId: Record<string, string[]>
  /** SHA of the last processed commit (for incremental resumption). */
  lastCommitSha?: string
  /** Export state at the last commit (for incremental resumption). */
  lastExportSnapshot?: Record<string, Record<string, SerializedExportItem>>
  parseWarnings?: string[]
}

/** Progress phases for streaming export history. */
export type ExportHistoryPhase =
  | 'start'
  | 'ensureRepoReady'
  | 'resolveHead'
  | 'gitLogCached'
  | 'buildCommitReleaseMap'
  | 'resolveEntries'
  | 'batch'
  | 'done'

/** Progress event yielded during export history streaming. */
export interface ExportHistoryProgressEvent {
  type: 'progress'
  phase: ExportHistoryPhase
  elapsedMs: number
  batchStart?: number
  batchSize?: number
  totalCommits?: number
  commitsProcessed?: number
  /** Accumulated export changes so far (only present on 'batch' events). */
  exports?: Record<string, ExportChange[]>
}

/** AsyncGenerator type for streaming export history with progress events. */
export type ExportHistoryGenerator = AsyncGenerator<
  ExportHistoryProgressEvent,
  ExportHistoryReport,
  void
>

/** Represents a section within a file. */
export interface Section {
  /**
   * The section anchor id. Uses slugified heading text for markdown-derived sections.
   * Uses the export name for programmatic sections (e.g. file export outlines rendered by `Reference`).
   */
  id: string

  /** The stringified heading text. */
  title: string

  /** Nested child sections. */
  children?: Section[]
}

export type FileSystemStructureKind =
  | 'Workspace'
  | 'Package'
  | 'Directory'
  | 'File'
  | 'ModuleExport'

interface BaseStructure {
  kind: FileSystemStructureKind
  name: string
  title: string
  slug: string
  path: string
}

export interface WorkspaceStructure extends BaseStructure {
  kind: 'Workspace'
  packageManager: PackageManagerName
}

export interface PackageStructure extends BaseStructure {
  kind: 'Package'
  version?: string
  description?: string
  relativePath: string
}

export interface DirectoryStructure extends BaseStructure {
  kind: 'Directory'
  depth: number
  relativePath: string
}

export interface FileStructure extends BaseStructure {
  kind: 'File'
  extension: string
  depth: number
  relativePath: string
  firstCommitDate?: Date
  lastCommitDate?: Date
  authors?: GitAuthor[]
  frontmatter?: Record<string, unknown>
  sections?: Section[]
  description?: string
  exports?: ModuleExportStructure[]
}

export interface ModuleExportStructure extends BaseStructure {
  kind: 'ModuleExport'
  relativePath?: string
  description?: string
  tags?: Array<{ name: string; value?: string }>
  resolvedType?: Kind
  firstCommitDate?: Date
  lastCommitDate?: Date
}

export type FileSystemStructure =
  | WorkspaceStructure
  | PackageStructure
  | DirectoryStructure
  | FileStructure

export type Expect<Type extends true> = Type

export type Not<_ extends false> = true

export type Is<Type, Expected> = Type extends Expected ? true : false

export type IsExact<Type, Expected> =
  (<T>() => T extends Type ? 1 : 2) extends <T>() => T extends Expected ? 1 : 2
    ? (<T>() => T extends Expected ? 1 : 2) extends <T>() => T extends Type
        ? 1
        : 2
      ? true
      : false
    : false

export type IsNot<Type, Expected> = Type extends Expected ? false : true

export type IsAny<Type> = 0 extends 1 & Type ? true : false

export type IsNotAny<Type> = true extends IsAny<Type> ? false : true

export type IsNever<Type> = Type extends never ? true : false

export type DirectoryEntry = {
  name: string
  path: string
  isDirectory: boolean
  isFile: boolean
}

/** Get the last segment of a path. */
type LastSegment<Path extends string> = Path extends `${infer _}/${infer Rest}`
  ? LastSegment<Rest>
  : Path

/**
 * Tests if a string leads with a number followed by a single dot.
 *
 * - `"01.introduction"` => `true` (numeric prefix + single dot)
 * - `"02.configuration.mdx"` => `false` (numeric prefix + 2 dots)
 * - `"myfile.txt"` => `false` (not purely a numeric prefix)
 */
type IsSingleDotNumericPrefix<Segment extends string> =
  Segment extends `${infer Digits}.${infer Rest}`
    ? Digits extends `${number}`
      ? // If `Rest` itself has another dot, then it's multiple dots => `false`
        Rest extends `${string}.${string}`
        ? false
        : true
      : false
    : false

/** Get the last part of a string after the final dot. */
type LastPartAfterDot<Segment extends string> =
  Segment extends `${string}.${infer Tail}` ? LastPartAfterDot<Tail> : Segment

/** Split a string by a delimiter. */
type SplitBy<
  Pattern extends string,
  Delimiter extends string,
> = Pattern extends `${infer Head}${Delimiter}${infer Tail}`
  ? Head | SplitBy<Tail, Delimiter>
  : Pattern

/** Parse the extension from a string. */
type ParseExtension<Extension extends string> =
  Extension extends `{${infer Nested}}`
    ? SplitBy<LastPartAfterDot<Nested>, ','>
    : Extension extends `@(${infer Nested})`
      ? SplitBy<LastPartAfterDot<Nested>, '|'>
      : LastPartAfterDot<Extension>

/** Extract the file extension from a path. */
export type ExtractFileExtension<Path extends string> =
  IsSingleDotNumericPrefix<LastSegment<Path>> extends true
    ? string
    : LastSegment<Path> extends `${string}.${infer Extension}`
      ? ParseExtension<Extension>
      : LastSegment<Path> extends `**/*.${infer Ext}`
        ? ParseExtension<Ext>
        : LastSegment<Path> extends `${string}/**/*.${infer Ext}`
          ? ParseExtension<Ext>
          : LastSegment<Path> extends `*.${infer Ext}`
            ? ParseExtension<Ext>
            : string

export type IsRecursiveFilePattern<Pattern extends string> =
  Pattern extends `**/${string}`
    ? true
    : Pattern extends `${string}/**/${string}`
      ? true
      : Pattern extends `${string}/**`
        ? true
        : false

// @ts-expect-error
type Tests = [
  Expect<Is<ExtractFileExtension<'index.ts'>, 'ts'>>,
  Expect<Is<ExtractFileExtension<'**/*.ts'>, 'ts'>>,
  Expect<Is<ExtractFileExtension<'*.tsx'>, 'tsx'>>,
  Expect<Is<ExtractFileExtension<'src/**/*.ts'>, 'ts'>>,
  Expect<Is<ExtractFileExtension<'src/**/index.ts'>, 'ts'>>,
  Expect<Is<ExtractFileExtension<'src/index.ts'>, 'ts'>>,
  Expect<Is<ExtractFileExtension<'src/index'>, string>>,
  Expect<Is<ExtractFileExtension<'/components/Button.test.tsx'>, 'tsx'>>,
  Expect<Is<ExtractFileExtension<'01.introduction'>, string>>,
  Expect<Is<ExtractFileExtension<'docs/01.introduction'>, string>>,
  Expect<Is<ExtractFileExtension<'docs/02.configuration.mdx'>, 'mdx'>>,
  Expect<Is<ExtractFileExtension<'src/index.{ts,tsx}'>, 'ts' | 'tsx'>>,
]
