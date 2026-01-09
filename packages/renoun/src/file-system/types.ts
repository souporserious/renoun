export type { ContentSection } from '@renoun/mdx'

import type { GitAuthor } from '../utils/get-local-git-file-metadata.ts'
import type { FileSystem } from './FileSystem.ts'
import type { PackageManagerName } from './PackageManager.ts'

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

export type ModuleExportResolvedType = Awaited<
  ReturnType<FileSystem['resolveTypeAtLocation']>
>

export interface ModuleExportStructure extends BaseStructure {
  kind: 'ModuleExport'
  relativePath?: string
  description?: string
  tags?: Array<{ name: string; value?: string }>
  resolvedType?: ModuleExportResolvedType
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
