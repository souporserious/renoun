import * as React from 'react'
import type { MDXContent, MDXComponents, SlugCasing } from '@renoun/mdx'
import { rehypePlugins } from '@renoun/mdx/rehype'
import { remarkPlugins } from '@renoun/mdx/remark'
import {
  createSlug,
  getMDXExportStaticValues,
  getMDXContent,
  getMDXSections,
  getMarkdownSections,
  parseFrontMatter,
  type FrontMatterParseResult,
} from '@renoun/mdx/utils'
import { Minimatch } from 'minimatch'

import { CodeBlock } from '../components/CodeBlock/index.ts'
import { Markdown, type MarkdownComponents } from '../components/Markdown.tsx'
import { getFileExportMetadata } from '../project/client.ts'
import { formatNameAsTitle } from '../utils/format-name-as-title.ts'
import { getClosestFile } from '../utils/get-closest-file.ts'
import {
  getEditorUri,
  type GetEditorUriOptions,
} from '../utils/get-editor-uri.ts'
import { getLocalGitFileMetadata } from '../utils/get-local-git-file-metadata.ts'
import type {
  GitMetadata,
  GitAuthor,
} from '../utils/get-local-git-file-metadata.ts'
import {
  getLocalGitExportMetadata,
  type GitExportMetadata,
} from '../utils/get-local-git-export-metadata.ts'
import type { FileRegion } from '../utils/get-file-regions.ts'
import {
  isJavaScriptLikeExtension,
  type IsJavaScriptLikeExtension,
  type HasJavaScriptLikeExtensions,
} from '../utils/is-javascript-like-extension.ts'
import {
  baseName,
  directoryName,
  ensureRelativePath,
  extensionName,
  joinPaths,
  normalizeSlashes,
  resolveSchemePath,
  removeExtension,
  removeAllExtensions,
  removeOrderPrefixes,
  relativePath,
  trimTrailingSlashes,
  type PathLike,
} from '../utils/path.ts'
import { getRootDirectory } from '../utils/get-root-directory.ts'
import type { TypeFilter } from '../utils/resolve-type.ts'
import type {
  FileSystem,
  FileSystemWriteFileContent,
  FileWritableStream,
} from './FileSystem.ts'
import { NodeFileSystem } from './NodeFileSystem.ts'
import { GitHostFileSystem } from './GitHostFileSystem.ts'
import {
  Repository,
  parseGitSpecifier,
  type RepositoryConfig,
  type GetFileUrlOptions,
  type GetDirectoryUrlOptions,
  type GetReleaseOptions,
  type GetReleaseUrlOptions,
  type Release,
} from './Repository.ts'
import {
  DirectorySnapshot,
  createDirectorySnapshot,
  type DirectorySnapshotDirectoryMetadata,
} from './directory-snapshot.ts'
import {
  createRangeLimitedStream,
  StreamableBlob,
  type StreamableContent,
} from './StreamableBlob.ts'
import type { StandardSchemaV1 } from './standard-schema.ts'
import type { ExtractFileExtension } from './types.ts'

export { FileSystem } from './FileSystem.ts'
export { GitHostFileSystem } from './GitHostFileSystem.ts'
export { InMemoryFileSystem } from './InMemoryFileSystem.ts'
export {
  StreamableBlob,
  createRangeLimitedStream,
  type StreamableContent as StreamingContent,
} from './StreamableBlob.ts'
export { NodeFileSystem } from './NodeFileSystem.ts'
export { Repository } from './Repository.ts'

const mimeTypesByExtension: Record<string, string> = {
  aac: 'audio/aac',
  avif: 'image/avif',
  bmp: 'image/bmp',
  css: 'text/css',
  csv: 'text/csv',
  gif: 'image/gif',
  htm: 'text/html',
  html: 'text/html',
  ico: 'image/vnd.microsoft.icon',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  js: 'text/javascript',
  json: 'application/json',
  mjs: 'text/javascript',
  md: 'text/markdown',
  mdx: 'text/markdown',
  mp3: 'audio/mpeg',
  mp4: 'video/mp4',
  oga: 'audio/ogg',
  ogg: 'audio/ogg',
  ogv: 'video/ogg',
  pdf: 'application/pdf',
  png: 'image/png',
  svg: 'image/svg+xml',
  ts: 'text/typescript',
  tsx: 'text/tsx',
  txt: 'text/plain',
  wasm: 'application/wasm',
  wav: 'audio/wav',
  webm: 'video/webm',
  webp: 'image/webp',
  xml: 'application/xml',
}

function inferMediaType(extension?: string) {
  const normalizedExtension = extension?.replace(/^\./, '').toLowerCase()
  return (
    (normalizedExtension && mimeTypesByExtension[normalizedExtension]) ||
    'application/octet-stream'
  )
}

const markdownComponents = {
  CodeBlock,
} satisfies MDXComponents & MarkdownComponents

const defaultLoaders: {
  md: ModuleLoader<any>
  mdx: ModuleLoader<any>
  [extension: string]: ModuleLoader<any>
} = {
  md: async (_, file) => {
    const value = await file.text()
    const frontMatter =
      'getFrontMatter' in file &&
      typeof (file as any).getFrontMatter === 'function'
        ? await (file as any).getFrontMatter()
        : undefined
    return {
      default: () => (
        <Markdown components={markdownComponents}>{value}</Markdown>
      ),
      frontMatter,
    }
  },
  mdx: async (_, file) => {
    const fileSystem = file.getParent().getFileSystem()
    let source: string

    try {
      source = await fileSystem.readFile(file.workspacePath)
    } catch (relativeError) {
      try {
        source = await fileSystem.readFile(file.absolutePath)
      } catch {
        throw relativeError
      }
    }
    const {
      default: Content,
      frontMatter: exportedFrontMatter,
      ...mdxExports
    } = await getMDXContent({
      source,
      remarkPlugins,
      rehypePlugins,
    })
    let frontMatter = exportedFrontMatter as Record<string, unknown> | undefined

    if (frontMatter === undefined) {
      frontMatter = parseFrontMatter(source).frontMatter
    }
    return {
      default: () => <Content components={markdownComponents} />,
      frontMatter,
      ...mdxExports,
    }
  },
} satisfies Record<string, ModuleRuntimeLoader<any>>

/** A function that resolves the module runtime. */
type ModuleRuntimeResult<Value> =
  | Value
  | Promise<Value>
  | (() => Value | Promise<Value>)

type ModuleRuntimeLoader<Value> = (
  path: string,
  file: File<any> | JavaScriptFile<any> | MarkdownFile<any> | MDXFile<any>
) => ModuleRuntimeResult<Value>

/** A record of named exports in a module. */
type ModuleExports<Value = unknown> = {
  [exportName: string]: Value
}

type NormalizeModuleTypes<Types> =
  IsAny<Types> extends true
    ? UnknownModuleExports
    : Types extends ModuleExports
      ? Types
      : Types extends object
        ? Types
        : UnknownModuleExports

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

export interface ContentSection extends Section {
  /** The heading level (1-6). */
  depth: number

  /** Concise summary derived from the section content. */
  summary?: string

  /** The heading content as JSX (preserves formatting like code, emphasis, etc.). */
  jsx?: React.ReactNode

  /** Nested child sections. */
  children?: ContentSection[]
}

/** A runtime loader for a specific package export (no path/file arguments). */
type PackageExportLoader<Module extends ModuleExports<any>> = (
  path: string
) => ModuleRuntimeResult<Module>

/** Shape of the `loader` map accepted by `Package`. */
type PackageExportLoaderMap = Record<
  string,
  PackageExportLoader<ModuleExports<any>>
>

/** Infers the module type from a `Package` export loader function. */
type InferPackageExportModule<Fn> = Fn extends () => infer Return
  ? Awaited<Return> extends ModuleExports<any>
    ? Awaited<Return>
    : never
  : never

type SourceReleaseOptions = GetReleaseOptions & {
  repository?: RepositoryConfig | string | Repository
}

type SourceReleaseUrlOptions = GetReleaseUrlOptions & {
  repository?: RepositoryConfig | string | Repository
}

/** A function that validates and returns a specific type. */
type BivariantCallback<Args extends any[], Return> = {
  bivarianceHack(...args: Args): Return
}['bivarianceHack']

/** A function that validates and returns a specific type. */
type ModuleExportValidator<
  Input = Record<string, unknown>,
  Output = Input,
> = BivariantCallback<[value: Input], Output>

export type FileSystemStructureType =
  | 'workspace'
  | 'package'
  | 'directory'
  | 'file'
  | 'export'

interface BaseStructure {
  type: FileSystemStructureType
  name: string
  title: string
  slug: string
  path: string
}

export interface WorkspaceStructure extends BaseStructure {
  type: 'workspace'
  packageManager: 'pnpm' | 'yarn' | 'npm' | 'bun' | 'unknown'
}

export interface PackageStructure extends BaseStructure {
  type: 'package'
  version?: string
  description?: string
  relativePath: string
}

export interface DirectoryStructure extends BaseStructure {
  type: 'directory'
  depth: number
  relativePath: string
}

export interface FileStructure extends BaseStructure {
  type: 'file'
  extension: string
  depth: number
  relativePath: string
  firstCommitDate?: Date
  lastCommitDate?: Date
  authors?: GitAuthor[]
  frontMatter?: Record<string, unknown>
  sections?: Section[]
  description?: string
  exports?: ModuleExportStructure[]
}

type ModuleExportResolvedType = Awaited<
  ReturnType<FileSystem['resolveTypeAtLocation']>
>

export interface ModuleExportStructure extends BaseStructure {
  type: 'export'
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

/** Utility type that infers the schema output from validator functions or a [Standard Schema](https://github.com/standard-schema/standard-schema?tab=readme-ov-file#standard-schema-spec). */
export type InferModuleExports<Exports> = {
  [ExportName in keyof Exports]: Exports[ExportName] extends StandardSchemaV1
    ? StandardSchemaV1.InferOutput<Exports[ExportName]>
    : Exports[ExportName] extends ModuleExportValidator<any, infer Output>
      ? Output
      : Exports[ExportName]
}

type Merge<A, B> = Omit<A, keyof B> & B

type MergeRecord<A, B> = {
  [K in keyof A | keyof B]: K extends keyof B
    ? K extends keyof A
      ? Merge<A[K], B[K]>
      : B[K]
    : K extends keyof A
      ? A[K]
      : never
}

type KnownSchemaExtension = 'js' | 'jsx' | 'ts' | 'tsx' | 'md' | 'mdx' | 'json'

type IsSchemaByExtension<Schema> =
  Schema extends Record<string, any>
    ? Extract<keyof Schema, KnownSchemaExtension> extends never
      ? false
      : true
    : false

type NormalizeFrontMatterAlias<Exports> =
  Exports extends Record<string, any>
    ? Merge<
        Merge<
          Exports,
          Exports extends { frontMatter: infer FrontMatterType }
            ? { frontmatter: FrontMatterType }
            : {}
        >,
        Exports extends { frontmatter: infer FrontMatterType }
          ? { frontMatter: FrontMatterType }
          : {}
      >
    : Exports

type InferDirectorySchemaOptionTypes<Option> = Option extends StandardSchemaV1
  ? StandardSchemaV1.InferOutput<Option> extends Record<string, any>
    ? NormalizeFrontMatterAlias<StandardSchemaV1.InferOutput<Option>>
    : {}
  : Option extends Record<string, any>
    ? InferModuleExports<Option> extends Record<string, any>
      ? NormalizeFrontMatterAlias<InferModuleExports<Option>>
      : {}
    : {}

type InferDirectorySchemaTypes<Schema> = [Schema] extends [undefined]
  ? {}
  : [Schema] extends [DirectorySchema]
    ? DirectorySchema extends Schema
      ? {}
      : IsSchemaByExtension<Schema> extends true
        ? {
            [Extension in Extract<
              keyof Schema,
              string
            >]: InferDirectorySchemaOptionTypes<Schema[Extension]>
          }
        : Record<string, InferDirectorySchemaOptionTypes<Schema>>
    : {}

type ApplyDirectorySchema<
  LoaderTypes extends Record<string, any>,
  Schema extends DirectorySchema | undefined,
> = MergeRecord<LoaderTypes, InferDirectorySchemaTypes<Schema>>

type ApplyFileSchemaOption<
  Types extends Record<string, any>,
  SchemaOption extends DirectorySchemaOption | undefined,
> = MergeRecord<
  Types,
  SchemaOption extends DirectorySchemaOption
    ? InferDirectorySchemaOptionTypes<SchemaOption>
    : {}
>

// (Intentionally no `InferDirectoryTypes` export: schema is applied via
// `ApplyDirectorySchema` to avoid changing the meaning of the first generic.)

/**
 * Directory-level schema configuration.
 *
 * - A Standard Schema validates the *module object* (e.g. `z.object({ frontMatter: ... })`).
 * - A schema map validates *individual exports* (e.g. `{ frontMatter: z.object(...) }`).
 * - Both forms can also be provided per extension via `{ mdx: ..., ts: ... }`.
 */
export type DirectorySchemaOption =
  | StandardSchemaV1
  | Record<string, StandardSchemaV1 | ModuleExportValidator>

export type DirectorySchema =
  | DirectorySchemaOption
  | Partial<Record<string, DirectorySchemaOption>>

/** A module loader runtime function. */
type ModuleLoader<Exports extends ModuleExports = ModuleExports> =
  ModuleRuntimeLoader<Exports>

interface GitMetadataProvider {
  getGitFileMetadata(path: string): Promise<GitMetadata>
}

function isGitMetadataProvider(
  fileSystem: FileSystem
): fileSystem is FileSystem & GitMetadataProvider {
  return (
    typeof (fileSystem as Partial<GitMetadataProvider>).getGitFileMetadata ===
    'function'
  )
}

interface GitExportMetadataProvider {
  getGitExportMetadata(
    path: string,
    startLine: number,
    endLine: number
  ): Promise<GitExportMetadata>
}

function isGitExportMetadataProvider(
  fileSystem: FileSystem
): fileSystem is FileSystem & GitExportMetadataProvider {
  return (
    typeof (fileSystem as Partial<GitExportMetadataProvider>)
      .getGitExportMetadata === 'function'
  )
}

/** A record of loaders for different file extensions. */
export type ModuleLoaders = {
  [extension: string]: ModuleLoader
}

/** A Vite-style module map returned by `import.meta.glob(...)`. */
type GlobModuleMap<Types = any> = Partial<Record<string, () => Promise<Types>>>

type DirectoryLoader = ModuleLoaders | ModuleRuntimeLoader<any> | GlobModuleMap

type UnknownModuleExports = { [exportName: string]: unknown }

type InferDirectoryTypesFromLoaders<Loaders extends DirectoryLoader> =
  // If `Loaders` is still the default `DirectoryLoader` union, don't infer.
  DirectoryLoader extends Loaders ? {} : InferDirectoryLoaderTypes<Loaders>

type ResolveDirectoryTypes<
  LoaderTypes extends Record<string, any>,
  Loaders extends DirectoryLoader,
  Schema extends DirectorySchema | undefined,
> = ApplyDirectorySchema<
  MergeRecord<LoaderTypes, InferDirectoryTypesFromLoaders<Loaders>>,
  Schema
>

type InferDirectoryLoaderTypes<Loader extends DirectoryLoader> =
  Loader extends ModuleRuntimeLoader<infer RuntimeTypes>
    ? Record<string, NormalizeModuleTypes<RuntimeTypes>>
    : Loader extends GlobModuleMap<infer GlobTypes>
      ? Record<string, NormalizeModuleTypes<GlobTypes>>
      : Loader extends ModuleLoaders
        ? InferModuleLoadersTypes<Loader>
        : never

type IsAny<Type> = 0 extends 1 & Type ? true : false

/** Infer the type of a loader based on its runtime return type. */
type InferModuleLoaderTypes<Loader extends ModuleLoader> =
  Loader extends ModuleRuntimeLoader<infer Types>
    ? NormalizeModuleTypes<Types>
    : never

function isRuntimeLoader(loader: any): loader is ModuleRuntimeLoader<any> {
  return typeof loader === 'function' && loader.length > 0
}

/**
 * Front matter parsed from the markdown file. When using the default
 * loaders this is populated automatically (if present), and custom
 * loaders can further narrow this shape via `schema`.
 */
export type FrontMatter = Record<string, unknown>

/** Default module types for common file extensions. */
export interface DefaultModuleTypes {
  md: {
    default: MDXContent
    frontmatter?: FrontMatter
    frontMatter?: FrontMatter
  }
  mdx: {
    default: MDXContent
    frontmatter?: FrontMatter
    frontMatter?: FrontMatter
  }
  json: JSONObject
}

type NormalizeFrontMatterExtensions<ExtensionTypes> =
  ExtensionTypes extends Record<string, any>
    ? MergeRecord<
        ExtensionTypes,
        {
          md: 'md' extends keyof ExtensionTypes
            ? NormalizeFrontMatterAlias<ExtensionTypes['md']>
            : never
          mdx: 'mdx' extends keyof ExtensionTypes
            ? NormalizeFrontMatterAlias<ExtensionTypes['mdx']>
            : never
        }
      >
    : ExtensionTypes

/** Merge default module types with custom types. */
export type WithDefaultTypes<Types> =
  IsAny<Types> extends true
    ? DefaultModuleTypes
    : NormalizeFrontMatterExtensions<MergeRecord<DefaultModuleTypes, Types>>

/** Infer default extension types for a file extension. */
type InferDefaultModuleTypes<Extension extends string> =
  Extension extends keyof DefaultModuleTypes
    ? DefaultModuleTypes[Extension]
    : ModuleExports

type JavaScriptFileExtensionTypes<
  Extension extends string,
  DirectoryTypes extends Record<string, any>,
> = Extension extends keyof DirectoryTypes
  ? Extension extends keyof DefaultModuleTypes
    ? InferDefaultModuleTypes<Extension> &
        DirectoryTypes[Extension] extends Record<string, any>
      ? InferDefaultModuleTypes<Extension> & DirectoryTypes[Extension]
      : ModuleExports
    : DirectoryTypes[Extension] extends Record<string, any>
      ? DirectoryTypes[Extension]
      : ModuleExports
  : InferDefaultModuleTypes<Extension>

type ExtensionElement<Extension> = Extension extends readonly (infer E)[]
  ? Extract<E, string>
  : Extract<Extension, string>

/** Infer extension types for all loaders in a module. */
export type InferModuleLoadersTypes<Loaders extends ModuleLoaders> = {
  [Extension in keyof Loaders]: Extension extends keyof DefaultModuleTypes
    ? Merge<
        Merge<
          DefaultModuleTypes[Extension],
          InferModuleLoaderTypes<Loaders[Extension]>
        >,
        Extension extends 'md' | 'mdx' ? { default: MDXContent } : {}
      >
    : InferModuleLoaderTypes<Loaders[Extension]>
}

/** Extract keys from runtime‑capable loaders. */
export type LoadersWithRuntimeKeys<Loaders> = Extract<
  keyof Loaders,
  'js' | 'jsx' | 'ts' | 'tsx' | 'md' | 'mdx'
>

/** Unwraps a loader result that may be a value, a promise, or a lazy factory. */
async function unwrapModuleResult<T>(result: any): Promise<T> {
  let value = result
  if (typeof value === 'function') {
    value = (value as () => any)()
  }
  if (value && typeof value.then === 'function') {
    value = await value
  }
  if (typeof value === 'function') {
    value = await (value as () => any)()
  }
  return value as T
}

const KNOWN_SCHEMA_EXTENSIONS = new Set([
  'js',
  'jsx',
  'ts',
  'tsx',
  'md',
  'mdx',
  'json',
])

function isStandardSchema(value: unknown): value is StandardSchemaV1 {
  return (
    !!value &&
    typeof value === 'object' &&
    '~standard' in (value as any) &&
    typeof (value as any)['~standard']?.validate === 'function'
  )
}

function isGlobModuleMap(value: unknown): value is GlobModuleMap<any> {
  if (!value || typeof value !== 'object') {
    return false
  }

  const record = value as Record<string, unknown>
  const keys = Object.keys(record)
  if (keys.length === 0) {
    return false
  }

  // Disambiguate from extension-to-loader maps like `{ mdx: (path) => import(...) }`.
  // Glob maps use file-like keys (usually starting with `./`, `../`, `/`, or containing `/`).
  if (keys.every((key) => KNOWN_SCHEMA_EXTENSIONS.has(key))) {
    return false
  }

  const looksLikeFilePathKey = (key: string) =>
    key.startsWith('./') ||
    key.startsWith('../') ||
    key.startsWith('/') ||
    key.includes('/') ||
    key.includes('\\')

  if (!keys.some(looksLikeFilePathKey)) {
    return false
  }

  // Vite glob values are typically `() => Promise<Module>`.
  return keys.every((key) => {
    const entry = record[key]
    return typeof entry === 'function' && (entry as Function).length === 0
  })
}

function resolveDirectorySchemaOption(
  schema: DirectorySchema | undefined,
  extension: string | undefined
): DirectorySchemaOption | undefined {
  if (!schema) {
    return undefined
  }

  // A single Standard Schema applies to all extensions.
  if (isStandardSchema(schema)) {
    return schema
  }

  // Disambiguate:
  // - `{ mdx: z.object(...) }` => per-extension
  // - `{ metadata: z.object(...) }` => per-export schema map
  if (extension && typeof schema === 'object') {
    const record = schema as Record<string, any>
    const keys = Object.keys(record)
    const looksLikeExtensionMap = keys.some((key) =>
      KNOWN_SCHEMA_EXTENSIONS.has(key)
    )

    if (looksLikeExtensionMap) {
      const option = record[extension]
      return option as DirectorySchemaOption | undefined
    }
  }

  return schema as DirectorySchemaOption
}

function validateStandardSchema(
  schema: StandardSchemaV1,
  value: unknown,
  context: { filePath: string; exportName?: string }
): unknown {
  const result = schema['~standard'].validate(
    value
  ) as StandardSchemaV1.Result<any>

  if (result.issues) {
    const issuesMessage = result.issues
      .map((issue) =>
        issue.path
          ? `  - ${issue.path.join('.')}: ${issue.message}`
          : `  - ${issue.message}`
      )
      .join('\n')

    const exportSuffix = context.exportName
      ? ` for export "${context.exportName}"`
      : ''

    throw new Error(
      `[renoun] Schema validation failed${exportSuffix} at file path: "${context.filePath}"\n\nThe following issues need to be fixed:\n${issuesMessage}`
    )
  }

  return result.value
}

function normalizeExportSchemaKey(name: string) {
  // Back-compat / ergonomic alias: allow `frontmatter` in schemas.
  if (name === 'frontmatter') {
    return 'frontMatter'
  }
  return name
}

function validateExportValueWithExportSchemaMap(
  schemaMap: Record<string, StandardSchemaV1 | ModuleExportValidator<any, any>>,
  name: string,
  value: unknown,
  filePath: string
) {
  const key = normalizeExportSchemaKey(name)
  const aliasKey =
    key === 'frontMatter'
      ? 'frontmatter'
      : key === 'frontmatter'
        ? 'frontMatter'
        : undefined

  const parser =
    schemaMap[key] ??
    (aliasKey ? schemaMap[aliasKey] : undefined) ??
    schemaMap[name]
  if (!parser) {
    return value
  }

  try {
    if (isStandardSchema(parser)) {
      return validateStandardSchema(parser, value, {
        filePath,
        exportName: key,
      })
    }
    return parser(value)
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(
        `[renoun] Schema validation failed to parse export "${key}" at file path: "${filePath}"\n\nThe following error occurred:\n${error.message}`
      )
    }
    throw error
  }
}

function applyModuleSchemaToModule(
  schema: StandardSchemaV1,
  moduleValue: any,
  filePath: string
) {
  // Provide an ergonomic alias for `frontmatter` while preserving `frontMatter`.
  const schemaInput =
    moduleValue && typeof moduleValue === 'object'
      ? {
          ...moduleValue,
          frontmatter: (moduleValue as any).frontMatter,
        }
      : moduleValue

  const parsed = validateStandardSchema(schema, schemaInput, { filePath })
  if (!parsed || typeof parsed !== 'object') {
    throw new Error(
      `[renoun] Schema validation returned a non-object value at file path: "${filePath}". Directory schemas must validate a module export object.`
    )
  }

  // Merge parsed keys back into the module object so transforms (e.g. `z.date()`) take effect.
  for (const [key, value] of Object.entries(parsed as Record<string, any>)) {
    if (key === 'frontmatter') {
      ;(moduleValue as any).frontMatter = value
      continue
    }
    ;(moduleValue as any)[key] = value
  }

  return moduleValue
}

function createGlobRuntimeLoader(
  glob: GlobModuleMap<any>
): ModuleRuntimeLoader<any> {
  return async (_path: string, file: any) => {
    const relative = normalizeSlashes(file.relativePath).replace(/^\.\/?/, '')
    const candidates = [relative, `./${relative}`, `/${relative}`]

    let importer: (() => Promise<any>) | undefined

    for (const candidate of candidates) {
      importer = glob[candidate]
      if (importer) {
        break
      }
    }

    if (!importer) {
      // Fall back to suffix match (helps when glob keys include an absolute-ish prefix).
      const matchKey = Object.keys(glob).find((key) =>
        normalizeSlashes(key).endsWith(relative)
      )
      if (matchKey) {
        importer = glob[matchKey]
      }
    }

    if (!importer) {
      throw new Error(
        `[renoun] import.meta.glob loader could not resolve module for file "${relative}". Ensure the glob includes this file and that the key matches the file path.`
      )
    }

    try {
      return await importer()
    } catch (error) {
      // If the importer exists but fails to parse fall back to a default loader for that extension when available.
      const fallback = file?.extension
        ? defaultLoaders[file.extension]
        : undefined
      if (fallback) {
        return fallback(_path, file)
      }
      throw error
    }
  }
}

/** A decoder for file contents. */
const fileTextDecoder = new TextDecoder('utf-8', { fatal: true })

/** Error for when a file is not found. */
export class FileNotFoundError extends Error {
  constructor(
    path: string | string[],
    extension?: any,
    context?: {
      /** Directory path (relative to workspace) where the lookup started. */
      directoryPath?: string

      /** Absolute directory path (useful in server builds). */
      absoluteDirectoryPath?: string

      /** Root path used by the Directory (relative to workspace). */
      rootPath?: string

      /** Nearby entries at the point of failure (base names only). */
      nearestCandidates?: string[]
    }
  ) {
    const normalizedPath = Array.isArray(path) ? joinPaths(...path) : path
    const normalizedExtension = extension
      ? Array.isArray(extension)
        ? extension
        : [extension]
      : []
    const extensionMessage = normalizedExtension.length
      ? ` with extension${normalizedExtension.length > 1 ? 's' : ''}: ${normalizedExtension.join(',')}`
      : ''

    const lines: string[] = [
      `[renoun] File not found at path "${normalizedPath}"${extensionMessage}`,
    ]

    const directoryHint =
      context?.directoryPath || context?.absoluteDirectoryPath
    if (directoryHint) {
      lines.push(`Lookup started in directory: "${directoryHint}"`)
    }
    if (context?.rootPath) {
      lines.push(`Directory root: "${context.rootPath}"`)
    }
    if (context?.nearestCandidates && context.nearestCandidates.length) {
      const preview = context.nearestCandidates
        .slice(0, 8)
        .map((n) => `- ${n}`)
        .join('\n')
      lines.push(`Nearby entries (at failure point):\n${preview}`)
    }

    super(lines.join('\n'))
    this.name = 'FileNotFoundError'
  }
}

/** A directory or file entry. */
export type FileSystemEntry<
  DirectoryTypes extends Record<string, any> = any,
  Extension = undefined,
> = Directory<DirectoryTypes> | FileWithExtension<DirectoryTypes, Extension>

/** Options for the `File#getPathname` and `File#getPathnameSegments` methods. */
export interface FilePathnameOptions {
  /** Whether to include the configured `Directory:options.basePathname` in the pathname. */
  includeBasePathname?: boolean

  /** Whether to include the directory named segment in the pathname segments e.g. `button/button` for `Button/Button.tsx`. */
  includeDirectoryNamedSegment?: boolean
}

/** Options for a file in the file system. */
export interface FileOptions<
  Types extends Record<string, any> = Record<string, any>,
  Path extends string = string,
  SchemaOption extends DirectorySchemaOption | undefined = undefined,
> {
  /** The path to the file. */
  path: Path | URL

  /** The base pathname to use for the file. */
  basePathname?: string | null

  /** The slug casing to use for the file. */
  slugCasing?: SlugCasing

  /** The depth of the file in the file system. */
  depth?: number

  /** Optional schema for this file (overrides the parent directory schema). */
  schema?: SchemaOption

  /**
   * Known byte length for the file contents.
   *
   * When omitted, `File` will ask the `FileSystem` for the file size synchronously.
   * If the size cannot be determined synchronously, the constructor will throw.
   */
  byteLength?: number

  /** The directory to use for the file. */
  directory?:
    | PathLike
    | Directory<Types, WithDefaultTypes<Types>, DirectoryLoader, undefined>
}

/** A file in the file system. */
export class File<
  DirectoryTypes extends Record<string, any> = Record<string, any>,
  Path extends string = string,
  Extension extends string = ExtractFileExtension<Path>,
> extends Blob {
  #name: string
  #baseName: string
  #modifierName?: string
  #order?: string
  #extension?: Extension
  #path: string
  #basePathname?: string | null
  #slugCasing: SlugCasing
  #directory: Directory<DirectoryTypes>
  #byteLength: number
  #schema?: DirectorySchemaOption

  constructor(options: FileOptions<DirectoryTypes, Path, any>) {
    // Parse path and extension to determine MIME type
    const resolvedPath = resolveSchemePath(options.path)
    const name = baseName(resolvedPath)
    const match = name.match(
      /^(?:(\d+)[.-])?([^.]+)(?:\.([^.]+))?(?:\.([^.]+))?$/
    )
    const extensionValue = (match?.[4] ?? match?.[3]) as Extension | undefined
    const type = inferMediaType(extensionValue)
    const directory =
      options.directory instanceof Directory
        ? options.directory
        : options.directory !== undefined
          ? new Directory({ path: options.directory })
          : new Directory()

    // Determine byte length for Blob.size compatibility.
    // When a directory is provided with a relative path, we need to resolve the
    // full filesystem path to look up the byte length.
    let byteLength = options.byteLength

    if (byteLength === undefined) {
      const fileSystem = directory.getFileSystem()

      // First try the resolved path directly
      byteLength = fileSystem.getFileByteLengthSync(resolvedPath)

      // If that fails and we have a directory, try combining paths
      if (byteLength === undefined && options.directory !== undefined) {
        const directoryPath = directory.workspacePath
        if (directoryPath && directoryPath !== '.') {
          const fullPath = joinPaths(directoryPath, resolvedPath)
          byteLength = fileSystem.getFileByteLengthSync(fullPath)
        }
      }
    }

    if (byteLength === undefined) {
      throw new Error(
        `[renoun] Unable to determine size for file: ${resolvedPath}. Ensure the FileSystem provides a synchronous byte length or pass { byteLength } when constructing File.`
      )
    }

    // Initialize Blob base class with empty parts and MIME type
    super([], { type })

    this.#directory = directory
    this.#name = name
    this.#path = resolvedPath
    this.#basePathname = options.basePathname
    this.#slugCasing = options.slugCasing ?? 'kebab'
    this.#byteLength = byteLength
    this.#schema = options.schema

    if (match) {
      this.#order = match[1]
      this.#baseName = match[2] ?? name
      this.#modifierName = match[4] ? match[3] : undefined
      this.#extension = (match[4] ?? match[3]) as Extension
    } else {
      this.#baseName = name
    }
  }

  /** The last modified time of the file in milliseconds. */
  get lastModified(): number {
    const fileSystem = this.#directory.getFileSystem()
    return (
      fileSystem.getFileLastModifiedMsSync(this.#path) ?? new Date().getTime()
    )
  }

  /** The intrinsic name of the file. */
  get name(): string {
    return this.#name
  }

  /** The base name of the file e.g. `index` in `index.ts`. */
  get baseName(): string {
    return this.#baseName
  }

  /** The modifier name of the file if defined e.g. `test` in `index.test.ts`. */
  get kind(): string | undefined {
    return this.#modifierName
  }

  /** The base file name formatted as a title. */
  get title() {
    return formatNameAsTitle(this.#baseName)
  }

  /** The order of the file if defined. */
  get order(): string | undefined {
    return this.#order
  }

  /** The extension of the file if defined. */
  get extension(): Extension {
    return this.#extension as Extension
  }

  /** Get the depth of the file starting from the root directory. */
  get depth() {
    return this.getPathnameSegments().length - 2
  }

  /** Get the schema configuration for this file if defined. */
  getSchema() {
    return this.#schema
  }

  /** Get the slug of the file. */
  get slug() {
    return createSlug(this.baseName, this.#slugCasing)
  }

  /**
   * Get the path of this file formatted for routes. The configured `slugCasing`
   * option will be used to format each segment.
   */
  getPathname(options?: FilePathnameOptions) {
    const includeBasePathname = options?.includeBasePathname ?? true
    const includeDirectoryNamedSegment =
      options?.includeDirectoryNamedSegment ?? false
    const fileSystem = this.#directory.getFileSystem()
    let path = fileSystem.getPathname(this.#path, {
      basePath:
        includeBasePathname && this.#basePathname !== null
          ? this.#basePathname
          : undefined,
      rootPath: this.#directory.getRootPath(),
    })

    if (!includeDirectoryNamedSegment || this.#slugCasing !== 'none') {
      let parsedPath = normalizeSlashes(path).split('/')
      const parsedSegments: string[] = []

      for (let index = 0; index < parsedPath.length; index++) {
        const segment = parsedPath[index]

        if (includeDirectoryNamedSegment || segment !== parsedPath[index - 1]) {
          parsedSegments.push(
            this.#slugCasing === 'none'
              ? segment
              : createSlug(segment, this.#slugCasing)
          )
        }
      }

      // Remove trailing 'index' or 'readme' if present
      if (['index', 'readme'].includes(this.baseName.toLowerCase())) {
        parsedSegments.pop()
      }

      path = parsedSegments.join('/')

      // Ensure the path always starts with a slash
      if (!path.startsWith('/')) {
        path = `/${path}`
      }
    }

    return path
  }

  /** Get the route path segments for this file. */
  getPathnameSegments(options?: FilePathnameOptions) {
    return this.getPathname(options).split('/').filter(Boolean)
  }

  /** The file path relative to the root directory. */
  get relativePath() {
    const rootPath = this.#directory.getRootPath()
    return rootPath ? relativePath(rootPath, this.#path) : this.#path
  }

  /** The file path relative to the workspace root. */
  get workspacePath() {
    const fileSystem = this.#directory.getFileSystem()
    const rawPath = this.#path

    // If the file path is already absolute or explicitly relative from the
    // workspace root (`./` / `../`), delegate directly to the file system.
    if (
      rawPath.startsWith('/') ||
      rawPath.startsWith('./') ||
      rawPath.startsWith('../')
    ) {
      return fileSystem.getRelativePathToWorkspace(rawPath)
    }

    // Base workspace-relative path for this file, ignoring any Directory prefix.
    const workspacePathForFile = fileSystem.getRelativePathToWorkspace(rawPath)
    const directoryWorkspacePath = this.#directory.workspacePath

    // If the directory is at the workspace root ("" or ".") or its workspace
    // path is unknown, the base workspace path is already correct.
    if (!directoryWorkspacePath || directoryWorkspacePath === '.') {
      return workspacePathForFile
    }

    // Derive the workspace "scope" (e.g. "packages/renoun") from the base
    // workspace path by stripping the raw path suffix when possible.
    let scope = ''
    const suffix = `/${rawPath}`
    if (workspacePathForFile.endsWith(suffix)) {
      scope = workspacePathForFile.slice(
        0,
        workspacePathForFile.length - suffix.length
      )
    }

    // If we could not determine a scope, fall back to joining the directory
    // workspace path with the raw file path.
    if (!scope) {
      return joinPaths(directoryWorkspacePath, rawPath)
    }

    // Normalize the directory workspace path by removing any repeated
    // occurrences of the scope prefix, then recombine:
    // scope + "/" + (directoryWorkspacePath without leading scope segments) + rawPath
    let remainingPath = directoryWorkspacePath
    const repeatedPrefix = `${scope}/`

    while (remainingPath.startsWith(repeatedPrefix)) {
      remainingPath = remainingPath.slice(repeatedPrefix.length)
    }

    const finalPath = remainingPath.replace(/^\/+/, '')

    if (!finalPath) {
      return joinPaths(scope, rawPath)
    }

    return joinPaths(scope, finalPath, rawPath)
  }

  /** The absolute file system path. */
  get absolutePath() {
    const fileSystem = this.#directory.getFileSystem()
    return fileSystem.getAbsolutePath(this.#path)
  }

  /** Get a URL to the file for the configured remote git repository. */
  #getRepositoryUrl(
    repository?: RepositoryConfig | string | Repository,
    options?: Omit<GetFileUrlOptions, 'path'>
  ) {
    const repo = this.#directory.getRepository(repository)
    const fileSystem = this.#directory.getFileSystem()

    return repo.getFileUrl({
      path: fileSystem.getRelativePathToWorkspace(this.#path),
      ...options,
    })
  }

  /** Get the URL to the file git blame for the configured git repository. */
  getBlameUrl(
    options?: Pick<GetFileUrlOptions, 'ref'> & {
      repository?: RepositoryConfig | string | Repository
    }
  ) {
    return this.#getRepositoryUrl(options?.repository, {
      type: 'blame',
      ref: options?.ref,
    })
  }

  /** Get the edit URL to the file source for the configured git repository. */
  getEditUrl(
    options?: Pick<GetFileUrlOptions, 'ref' | 'line'> & {
      repository?: RepositoryConfig | string | Repository
    }
  ) {
    return this.#getRepositoryUrl(options?.repository, {
      type: 'edit',
      ref: options?.ref,
      line: options?.line,
    })
  }

  /** Get the URL to the file history for the configured git repository. */
  getHistoryUrl(
    options?: Pick<GetFileUrlOptions, 'ref'> & {
      repository?: RepositoryConfig | string | Repository
    }
  ) {
    return this.#getRepositoryUrl(options?.repository, {
      type: 'history',
      ref: options?.ref,
    })
  }

  /** Get the URL to the raw file contents for the configured git repository. */
  getRawUrl(
    options?: Pick<GetFileUrlOptions, 'ref'> & {
      repository?: RepositoryConfig | string | Repository
    }
  ) {
    return this.#getRepositoryUrl(options?.repository, {
      type: 'raw',
      ref: options?.ref,
    })
  }

  /** Get the URL to the file source for the configured git repository. */
  getSourceUrl(
    options?: Pick<GetFileUrlOptions, 'ref' | 'line'> & {
      repository?: RepositoryConfig | string | Repository
    }
  ) {
    return this.#getRepositoryUrl(options?.repository, {
      type: 'source',
      ref: options?.ref,
      line: options?.line,
    })
  }

  /** Get a release URL for the configured git repository. */
  getReleaseUrl(options?: SourceReleaseUrlOptions) {
    const { repository: repositoryOption, ...rest } = options ?? {}
    return this.#directory.getRepository(repositoryOption).getReleaseUrl(rest)
  }

  /** Retrieve metadata about a release for the configured git repository. */
  getRelease(options?: SourceReleaseOptions): Promise<Release> {
    const { repository: repositoryOption, ...rest } = options ?? {}
    return this.#directory.getRepository(repositoryOption).getRelease(rest)
  }

  /** Get the URI to the file source code for the configured editor. */
  getEditorUri(options?: Omit<GetEditorUriOptions, 'path'>) {
    return getEditorUri({
      path: this.absolutePath,
      line: options?.line,
      column: options?.column,
      editor: options?.editor,
    })
  }

  /** Get the first local git commit date of the file. */
  async getFirstCommitDate() {
    const fileSystem = this.#directory.getFileSystem()
    const gitMetadata = isGitMetadataProvider(fileSystem)
      ? await fileSystem.getGitFileMetadata(this.#path)
      : await getLocalGitFileMetadata(this.#path)
    return gitMetadata.firstCommitDate
  }

  /** Get the last local git commit date of the file. */
  async getLastCommitDate() {
    const fileSystem = this.#directory.getFileSystem()
    const gitMetadata = isGitMetadataProvider(fileSystem)
      ? await fileSystem.getGitFileMetadata(this.#path)
      : await getLocalGitFileMetadata(this.#path)
    return gitMetadata.lastCommitDate
  }

  /** Get the local git authors of the file. */
  async getAuthors() {
    const fileSystem = this.#directory.getFileSystem()
    const gitMetadata = isGitMetadataProvider(fileSystem)
      ? await fileSystem.getGitFileMetadata(this.#path)
      : await getLocalGitFileMetadata(this.#path)
    return gitMetadata.authors
  }

  /** Get the parent directory containing this file. */
  getParent() {
    return this.#directory
  }

  /**
   * Get the previous and next sibling entries (files or directories) of the parent directory.
   * If the file is an index or readme file, the siblings will be retrieved from the parent directory.
   */
  async getSiblings<
    GroupTypes extends Record<string, any> = DirectoryTypes,
  >(options?: {
    collection?: Collection<GroupTypes, FileSystemEntry<any>[]>
    includeDirectoryNamedSegment?: boolean
  }): Promise<
    [
      FileSystemEntry<DirectoryTypes> | undefined,
      FileSystemEntry<DirectoryTypes> | undefined,
    ]
  > {
    const isIndexOrReadme = ['index', 'readme'].includes(
      this.baseName.toLowerCase()
    )
    if (isIndexOrReadme) {
      return this.#directory.getSiblings() as any
    }

    const entries = await (options?.collection
      ? options.collection.getEntries({ recursive: true })
      : this.#directory.getEntries())
    const path = this.getPathname({
      includeDirectoryNamedSegment: options?.includeDirectoryNamedSegment,
    })
    const index = entries.findIndex((entry) => entry.getPathname() === path)
    const previous = index > 0 ? entries[index - 1] : undefined
    const next = index < entries.length - 1 ? entries[index + 1] : undefined

    return [previous, next]
  }

  protected async getFileStructureBase(): Promise<FileStructure> {
    let firstCommitDate: Date | undefined
    let lastCommitDate: Date | undefined
    let authors: GitAuthor[] | undefined

    try {
      ;[firstCommitDate, lastCommitDate, authors] = await Promise.all([
        this.getFirstCommitDate().catch(() => undefined),
        this.getLastCommitDate().catch(() => undefined),
        this.getAuthors().catch(() => undefined),
      ])
    } catch {
      // Swallow git errors to keep structure generation resilient.
    }

    return {
      type: 'file',
      name: this.name,
      title: this.title,
      slug: this.slug,
      path: this.getPathname(),
      relativePath: this.workspacePath,
      extension: this.extension,
      depth: this.depth,
      firstCommitDate,
      lastCommitDate,
      authors,
    }
  }

  async getStructure(): Promise<FileStructure> {
    return this.getFileStructureBase()
  }

  /** Read the file contents as bytes. */
  override async bytes(): Promise<Uint8Array<ArrayBuffer>> {
    const fileSystem = this.#directory.getFileSystem()
    const binary = await fileSystem.readFileBinary(this.#path)
    // Ensure ArrayBuffer-backed Uint8Array for Blob compatibility.
    const buffer = new ArrayBuffer(binary.byteLength)
    new Uint8Array(buffer).set(binary)
    return new Uint8Array(buffer)
  }

  /** Create a readable stream for the file contents. */
  override stream(): ReadableStream<Uint8Array<ArrayBuffer>> {
    const fileSystem = this.#directory.getFileSystem()
    return fileSystem.readFileStream(this.#path) as any
  }

  /** Get the file size in bytes without reading the contents. */
  override get size(): number {
    return this.#byteLength
  }

  /** Read the file contents as text (UTF-8 decode, Blob semantics). */
  override async text(): Promise<string> {
    const bytes = await this.bytes()
    return fileTextDecoder.decode(bytes)
  }

  /** Read the file contents as an ArrayBuffer. */
  override async arrayBuffer(): Promise<ArrayBuffer> {
    const binary = await this.bytes()
    return binary.buffer
  }

  /** Slice the file contents without buffering. */
  override slice(start?: number, end?: number, contentType?: string): Blob {
    const fileSystem = this.#directory.getFileSystem()
    const streamableContent: StreamableContent = {
      byteLength: this.#byteLength,
      stream: (rangeStart, rangeEnd) =>
        createRangeLimitedStream(
          () => fileSystem.readFileStream(this.#path),
          rangeStart,
          rangeEnd
        ),
    }
    return new StreamableBlob(streamableContent, {
      type: contentType ?? this.type,
    }).slice(start, end, contentType)
  }

  /** Get the byte length of this file without reading the contents. */
  async getByteLength(): Promise<number> {
    return this.size
  }

  /** Write content to this file. */
  async write(content: FileSystemWriteFileContent): Promise<void> {
    const fileSystem = this.#directory.getFileSystem()
    await fileSystem.writeFile(this.#path, content)
    this.#directory.invalidateSnapshots()
  }

  /** Create a writable stream for this file. */
  writeStream(): FileWritableStream {
    const fileSystem = this.#directory.getFileSystem()
    this.#directory.invalidateSnapshots()
    return fileSystem.writeFileStream(this.#path)
  }

  /** Delete this file from the file system. */
  async delete(): Promise<void> {
    const fileSystem = this.#directory.getFileSystem()
    await fileSystem.deleteFile(this.#path)
    this.#directory.invalidateSnapshots()
  }

  /** Check if this file exists in the file system. */
  async exists(): Promise<boolean> {
    const fileSystem = this.#directory.getFileSystem()
    return fileSystem.fileExists(this.#path)
  }
}

export type JSONPrimitive = string | number | boolean | null

export type JSONValue = JSONPrimitive | JSONValue[] | JSONObject

export type JSONObject = {
  [Key: string]: JSONValue
}

export interface JSONFileOptions<
  Data extends Record<string, any> = JSONObject,
  DirectoryTypes extends Record<string, any> = Record<string, any>,
  Path extends string = string,
> extends FileOptions<DirectoryTypes, Path, any> {
  schema?: StandardSchemaV1<Data> | ((value: unknown) => Data)
}

type IsArray<Type> = Type extends readonly any[]
  ? true
  : Type extends any[]
    ? true
    : false

type Element<Type> = Type extends readonly (infer Item)[]
  ? Item
  : Type extends (infer Item)[]
    ? Item
    : never

type IsNumericString<String extends string> = String extends `${number}`
  ? true
  : false

type JSONPathValueWithSegments<
  Data,
  Segments extends string[],
> = Segments extends []
  ? Data
  : // at least one segment
    Segments extends [infer Head extends string, ...infer Rest extends string[]]
    ? IsArray<Data> extends true
      ? // Head must be a number-like segment for arrays
        IsNumericString<Head> extends true
        ? JSONPathValueWithSegments<Element<Data>, Rest> | undefined
        : undefined
      : // Head must be a key for objects
        Head extends keyof Data
        ? Rest['length'] extends 0
          ? Data[Head]
          : JSONPathValueWithSegments<Data[Head], Rest>
        : undefined
    : never

type JSONPathSegments<Path extends string> =
  Path extends `${infer Head}.${infer Rest}`
    ? [Head, ...JSONPathSegments<Rest>]
    : Path extends ''
      ? []
      : [Path]

export type JSONPathValue<
  Data,
  Path extends string,
> = JSONPathValueWithSegments<Data, JSONPathSegments<Path>>

export type JSONPropertyPath<Data> =
  // allow numeric segments in arrays, and recurse into element type
  IsArray<Data> extends true
    ? `${number}` | `${number}.${JSONPropertyPath<Element<Data>>}`
    : // objects keys or "key.nested"
      Data extends Record<string, any>
      ?
          | Extract<keyof Data, string>
          | {
              [Key in Extract<keyof Data, string>]: IsArray<
                Data[Key]
              > extends true
                ?
                    | `${Key}.${number}`
                    | `${Key}.${number}.${JSONPropertyPath<Element<Data[Key]>>}`
                : Data[Key] extends Record<string, any>
                  ? `${Key}.${JSONPropertyPath<Data[Key]>}`
                  : never
            }[Extract<keyof Data, string>]
      : never

/** A JSON file in the file system. */
export class JSONFile<
  Data extends Record<string, any> = JSONObject,
  DirectoryTypes extends Record<string, any> = Record<string, any>,
  const Path extends string = string,
  Extension extends string = ExtractFileExtension<Path>,
> extends File<DirectoryTypes, Path, Extension> {
  #dataPromise?: Promise<Data>
  #schema?: StandardSchemaV1<Data> | ((value: unknown) => Data)

  constructor(fileOptions: JSONFileOptions<Data, DirectoryTypes, Path>) {
    const { schema, ...rest } = fileOptions
    super(rest as any)
    this.#schema = schema
  }

  async #readData(): Promise<Data> {
    const source = await this.text()

    try {
      let value = JSON.parse(source) as unknown

      // Optionally validate/coerce using provided schema or validator
      if (this.#schema) {
        try {
          const schema = this.#schema as any
          if (schema && typeof schema === 'object' && '~standard' in schema) {
            const result = (schema as StandardSchemaV1<Data>)[
              '~standard'
            ].validate(value) as StandardSchemaV1.Result<Data>

            if (result.issues) {
              const issuesMessage = result.issues
                .map((issue) =>
                  issue.path
                    ? `  - ${issue.path.join('.')}: ${issue.message}`
                    : `  - ${issue.message}`
                )
                .join('\n')

              throw new Error(
                `[renoun] Schema validation failed for JSON file at path: "${this.absolutePath}"\n\nThe following issues need to be fixed:\n${issuesMessage}`
              )
            }

            value = result.value
          } else if (typeof this.#schema === 'function') {
            value = this.#schema(value)
          }
        } catch (error) {
          if (error instanceof Error) {
            throw new Error(
              `[renoun] Schema validation failed to parse JSON at file path: "${this.absolutePath}"\n\nThe following error occurred:\n${error.message}`
            )
          }
        }
      }

      return value as Data
    } catch (error) {
      const reason = error instanceof Error ? ` ${error.message}` : ''
      throw new Error(
        `[renoun] Failed to parse JSON file at path "${this.absolutePath}".${reason}`
      )
    }
  }

  async #getData(): Promise<Data> {
    if (!this.#dataPromise) {
      this.#dataPromise = this.#readData()
    }

    return this.#dataPromise
  }

  /**
   * Get a value from the JSON data using dot notation.
   *
   * Returns `undefined` when the path cannot be resolved.
   */
  async get(): Promise<Data>
  async get<Path extends JSONPropertyPath<Data>>(
    path: Path
  ): Promise<JSONPathValue<Data, Path>>
  async get(path?: any): Promise<any> {
    if (path === undefined) {
      return this.#getData() as Promise<Data>
    }

    const data = await this.#getData()
    const segments = path.split('.')

    let value: any = data

    for (const segment of segments) {
      if (value === undefined || value === null) {
        return undefined as JSONPathValue<Data, Path>
      }

      if (typeof value !== 'object') {
        return undefined as JSONPathValue<Data, Path>
      }

      value = (value as Record<string, any>)[segment]
    }

    return value
  }
}

/** Error for when a module export cannot be found. */
export class ModuleExportNotFoundError extends Error {
  constructor(path: string, name: string, className: string) {
    super(
      `[renoun] ${className} module export "${name}" not found in path "${path}"`
    )
    this.name = 'ModuleExportNotFoundError'
  }
}

/** A JavaScript module export. */
export class ModuleExport<Value> {
  #name: string
  #file: JavaScriptFile<any>
  #loader?: ModuleLoader<any>
  #slugCasing: SlugCasing
  #metadata: Awaited<ReturnType<typeof getFileExportMetadata>> | undefined
  #staticPromise?: Promise<Value>
  #runtimePromise?: Promise<Value>

  constructor(
    name: string,
    file: JavaScriptFile<any>,
    loader?: ModuleLoader<any>,
    slugCasing?: SlugCasing
  ) {
    this.#name = name
    this.#file = file
    this.#loader = loader
    this.#slugCasing = slugCasing ?? 'kebab'
  }

  static async init<Value>(
    name: string,
    file: JavaScriptFile<any>,
    loader?: ModuleLoader<any>,
    slugCasing?: SlugCasing
  ): Promise<ModuleExport<Value>> {
    const fileExport = new ModuleExport<Value>(name, file, loader, slugCasing)
    await fileExport.getStaticMetadata()
    return fileExport
  }

  async #getLocation() {
    return this.#file.getExportLocation(this.#name)
  }

  async #isNotStatic() {
    const location = await this.#getLocation()
    return location === undefined
  }

  protected async getStaticMetadata() {
    if (await this.#isNotStatic()) {
      return undefined
    }

    if (this.#metadata !== undefined) {
      return this.#metadata
    }

    const location = await this.#getLocation()

    if (location === undefined) {
      return undefined
    }

    const fileSystem = this.#file.getParent().getFileSystem()

    this.#metadata = await fileSystem.getFileExportMetadata(
      this.#name,
      location.path,
      location.position,
      location.kind
    )

    return this.#metadata
  }

  /** Get the slug of the file export. */
  get slug() {
    return createSlug(this.name, this.#slugCasing)
  }

  /** Get the name of the export. Default exports will use the file name or declaration name if available. */
  get name() {
    if (this.#metadata === undefined) {
      return this.#name === 'default' ? this.#file.name : this.#name
    }
    return this.#metadata?.name || this.#name
  }

  /** The export name formatted as a title. */
  get title() {
    return formatNameAsTitle(this.name)
  }

  /** Get the JSDoc description for the export. */
  get description() {
    return this.#metadata?.jsDocMetadata?.description
  }

  /** Get the JSDoc tags for the export. */
  getTags({
    includeTypes = false,
  }: {
    /** Whether to include type-related tags e.g. `@param`, `@returns`, `@type`, etc. */
    includeTypes?: boolean
  } = {}) {
    const tags = this.#metadata?.jsDocMetadata?.tags

    if (!tags || includeTypes) {
      return tags
    }

    const filteredTags = tags.filter((tag) => tag.name !== 'template')

    return filteredTags.length > 0 ? filteredTags : undefined
  }

  /** Get the environment of the export. */
  getEnvironment() {
    return this.#metadata?.environment
  }

  /**
   * Get the source text of the export, optionally including dependencies.
   *
   * Note, including dependencies can be expensive to calculate, only use when necessary.
   */
  async text({ includeDependencies }: { includeDependencies?: boolean } = {}) {
    const location = await this.#getLocation()

    if (location === undefined) {
      throw new Error(
        `[renoun] Export cannot be statically analyzed at file path "${this.#file.relativePath}".`
      )
    }

    const fileSystem = this.#file.getParent().getFileSystem()

    return fileSystem.getFileExportText(
      location.path,
      location.position,
      location.kind,
      includeDependencies
    )
  }

  /** Get the start and end position of the export in the file system. */
  getPosition() {
    return this.#metadata?.location.position
  }

  /** Get the edit URL to the file export source for the configured git repository. */
  getEditUrl(
    options?: Pick<GetFileUrlOptions, 'ref'> & {
      repository?: RepositoryConfig | string | Repository
    }
  ) {
    return this.#file.getEditUrl({
      ref: options?.ref,
      line: this.#metadata?.location?.position.start.line,
      repository: options?.repository,
    })
  }

  /** Get the URL to the file export source for the configured git repository. */
  getSourceUrl(
    options?: Pick<GetFileUrlOptions, 'ref'> & {
      repository?: RepositoryConfig | string | Repository
    }
  ) {
    return this.#file.getSourceUrl({
      ref: options?.ref,
      line: this.#metadata?.location?.position.start.line,
      repository: options?.repository,
    })
  }

  getReleaseUrl(options?: SourceReleaseUrlOptions) {
    return this.#file.getReleaseUrl(options)
  }

  getRelease(options?: SourceReleaseOptions) {
    return this.#file.getRelease(options)
  }

  /** Get the URI to the file export source code for the configured editor. */
  getEditorUri(options?: Omit<GetEditorUriOptions, 'path'>) {
    const path = this.#file.absolutePath

    if (this.#metadata?.location) {
      const location = this.#metadata.location

      return getEditorUri({
        path,
        line: options?.line ?? location.position.start.line,
        column: options?.column ?? location.position.start.column,
        editor: options?.editor,
      })
    }

    return getEditorUri({
      path,
      line: options?.line,
      column: options?.column,
      editor: options?.editor,
    })
  }

  /** Get the first git commit date that touched this export. */
  async getFirstCommitDate() {
    const metadata = await this.getStaticMetadata()

    if (!metadata?.location) {
      return undefined
    }

    const startLine = metadata.location.position.start.line
    const endLine = Math.max(startLine, metadata.location.position.end.line)
    const location = await this.#getLocation()

    if (location === undefined) {
      return undefined
    }

    const fileSystem = this.#file.getParent().getFileSystem()
    const gitMetadata = isGitExportMetadataProvider(fileSystem)
      ? await fileSystem.getGitExportMetadata(location.path, startLine, endLine)
      : await getLocalGitExportMetadata(location.path, startLine, endLine)

    return gitMetadata.firstCommitDate
  }

  /** Get the last git commit date that touched this export. */
  async getLastCommitDate() {
    const metadata = await this.getStaticMetadata()

    if (!metadata?.location) {
      return undefined
    }

    const startLine = metadata.location.position.start.line
    const endLine = Math.max(startLine, metadata.location.position.end.line)
    const location = await this.#getLocation()

    if (location === undefined) {
      return undefined
    }

    const fileSystem = this.#file.getParent().getFileSystem()
    const gitMetadata = isGitExportMetadataProvider(fileSystem)
      ? await fileSystem.getGitExportMetadata(location.path, startLine, endLine)
      : await getLocalGitExportMetadata(location.path, startLine, endLine)

    return gitMetadata.lastCommitDate
  }

  /** Get the resolved type of the export. */
  async getType(filter?: TypeFilter) {
    const location = await this.#getLocation()

    if (location === undefined) {
      throw new Error(
        `[renoun] Export cannot not be statically analyzed at file path "${this.#file.relativePath}".`
      )
    }

    const fileSystem = this.#file.getParent().getFileSystem()

    return fileSystem.resolveTypeAtLocation(
      location.path,
      location.position,
      location.kind,
      filter
    )
  }

  /** Attempt to return a literal value for this export if it can be determined statically. */
  async getStaticValue(): Promise<Value> {
    if (process.env.NODE_ENV === 'production') {
      if (!this.#staticPromise) {
        this.#staticPromise = this.#getStaticValue()
      }
      return this.#staticPromise
    }
    return this.#getStaticValue()
  }

  async #getStaticValue(): Promise<Value> {
    const location = await this.#getLocation()

    if (location === undefined) {
      throw new Error(
        `[renoun] Export cannot be statically analyzed at file path "${this.#file.relativePath}".`
      )
    }

    const fileSystem = this.#file.getParent().getFileSystem()
    const staticValue = fileSystem.getFileExportStaticValue(
      location.path,
      location.position,
      location.kind
    )

    if (staticValue === undefined) {
      throw new Error(
        `[renoun] Export cannot be statically analyzed at file path "${this.#file.relativePath}".`
      )
    }

    return this.#file.parseExportValue(this.#name, staticValue)
  }

  #getModule() {
    if (this.#loader === undefined) {
      const parentPath = this.#file.getParent().workspacePath

      throw new Error(
        `[renoun] A loader for the parent Directory at ${parentPath} is not defined.`
      )
    }

    const path = removeExtension(this.#file.relativePath)

    const loader = this.#loader

    return (async () => {
      const moduleValue = await unwrapModuleResult<any>(
        loader(path, this.#file)
      )

      const schemaOption =
        this.#file.getSchema() ??
        resolveDirectorySchemaOption(
          this.#file.getParent().getSchema(),
          this.#file.extension
        )

      if (schemaOption && isStandardSchema(schemaOption)) {
        return applyModuleSchemaToModule(
          schemaOption,
          moduleValue,
          this.#file.absolutePath
        )
      }

      return moduleValue
    })()
  }

  /**
   * Get the runtime value of the export. An error will be thrown if the export
   * is not found or the configured schema validation for this file extension fails.
   */
  async getRuntimeValue(): Promise<Value> {
    if (process.env.NODE_ENV === 'production') {
      if (!this.#runtimePromise) {
        this.#runtimePromise = this.#getRuntimeValue()
      }
      return this.#runtimePromise
    }
    return this.#getRuntimeValue()
  }

  async #getRuntimeValue(): Promise<Value> {
    const fileModule = await this.#getModule()

    if (this.#name in fileModule === false) {
      throw new Error(
        `[renoun] JavaScript file export "${String(this.#name)}" does not have a runtime value.`
      )
    }

    const fileModuleExport = fileModule[this.#name]

    if (fileModuleExport === undefined) {
      throw new Error(
        `[renoun] JavaScript file export "${this.#name}" not found in ${this.#file.absolutePath}`
      )
    }

    return this.#file.parseExportValue(this.#name, fileModuleExport)
  }

  /** Get the value of this export, preferring a static value and falling back to runtime if available. */
  async getValue(): Promise<Value> {
    try {
      const staticValue = await this.getStaticValue()

      if (staticValue !== undefined) {
        return staticValue as Value
      }
    } catch {
      // ignore and fall back to runtime if possible
    }

    if (this.#loader !== undefined) {
      return this.getRuntimeValue()
    }

    throw new Error(
      `[renoun] JavaScript file export "${this.#name}" could not be determined statically or at runtime for path "${this.#file.absolutePath}". Ensure the directory has a loader defined for resolving "${this.#file.extension}" files.`
    )
  }

  async getStructure(): Promise<ModuleExportStructure> {
    let resolvedType: ModuleExportResolvedType | undefined
    let firstCommitDate: Date | undefined
    let lastCommitDate: Date | undefined

    try {
      resolvedType = await this.getType()
    } catch {
      // Ignore type resolution failures for structure generation.
    }

    try {
      ;[firstCommitDate, lastCommitDate] = await Promise.all([
        this.getFirstCommitDate().catch(() => undefined),
        this.getLastCommitDate().catch(() => undefined),
      ])
    } catch {
      // Ignore git errors for structure generation.
    }

    const tags = this.getTags()
    const normalizedTags =
      tags?.map((tag) => {
        const text = tag.text as unknown
        let value: string | undefined

        if (Array.isArray(text)) {
          value = text
            .map((part: any) => (typeof part === 'string' ? part : part?.text))
            .filter(Boolean)
            .join('')
            .trim()
        } else if (typeof text === 'string') {
          value = text
        }

        return {
          name: tag.name,
          value: value && value.length > 0 ? value : undefined,
        }
      }) ?? undefined

    const slug = this.slug
    const filePath = this.#file.getPathname()

    return {
      type: 'export',
      name: this.name,
      title: this.title,
      slug,
      path: `${filePath}#${slug}`,
      relativePath: `${this.#file.workspacePath}#${slug}`,
      description: this.description,
      tags: normalizedTags,
      resolvedType,
      firstCommitDate,
      lastCommitDate,
    }
  }
}

/** Options for a JavaScript file in the file system. */
export interface JavaScriptFileOptions<
  Types extends Record<string, any>,
  DirectoryTypes extends Record<string, any>,
  Path extends string,
> extends FileOptions<DirectoryTypes, Path> {
  loader?: ModuleLoader<Types>
}

/** A JavaScript file in the file system. */
export class JavaScriptFile<
  Types extends InferDefaultModuleTypes<Path> = any,
  DirectoryTypes extends Record<string, any> = Record<string, any>,
  const Path extends string = string,
  Extension extends string = ExtractFileExtension<Path>,
> extends File<DirectoryTypes, Path, Extension> {
  #exports = new Map<string, ModuleExport<any>>()
  #loader?: ModuleLoader<Types>
  #slugCasing?: SlugCasing
  #modulePromise?: Promise<any>
  #sections?: Section[]

  constructor({
    loader,
    ...fileOptions
  }: JavaScriptFileOptions<Types, DirectoryTypes, Path>) {
    super(fileOptions)

    if (loader === undefined) {
      const extension = this.extension

      if (extension) {
        this.#loader = defaultLoaders[extension]
      }
    } else {
      this.#loader = loader
    }

    this.#slugCasing = fileOptions.slugCasing ?? 'kebab'
  }

  #getModule() {
    if (this.#loader === undefined) {
      const parentPath = this.getParent().relativePath

      throw new Error(
        `[renoun] A loader for the parent Directory at ${parentPath} is not defined.`
      )
    }

    const path = removeExtension(this.relativePath)
    const loader = this.#loader
    let executeModuleLoader: () => Promise<any>

    executeModuleLoader = async () => {
      const moduleValue = await unwrapModuleResult(loader(path, this))
      const schemaOption =
        this.getSchema() ??
        resolveDirectorySchemaOption(
          this.getParent().getSchema(),
          this.extension
        )

      if (schemaOption && isStandardSchema(schemaOption)) {
        return applyModuleSchemaToModule(
          schemaOption,
          moduleValue,
          this.absolutePath
        )
      }

      return moduleValue
    }

    if (process.env.NODE_ENV === 'production') {
      if (this.#modulePromise) {
        return this.#modulePromise
      }
      this.#modulePromise = executeModuleLoader()
      return this.#modulePromise
    }

    return executeModuleLoader()
  }

  /** Parse and validate an export value using the configured schema if available. */
  parseExportValue(name: string, value: any): any {
    const extension = this.extension

    if (!extension || !this.#loader) {
      return value
    }

    const schemaOption =
      this.getSchema() ??
      resolveDirectorySchemaOption(this.getParent().getSchema(), extension)

    // Module-level schemas are applied when loading the module.
    if (!schemaOption || isStandardSchema(schemaOption)) {
      return value
    }

    return validateExportValueWithExportSchemaMap(
      schemaOption,
      name,
      value,
      this.absolutePath
    )
  }

  /** Get all export names and positions from the JavaScript file. */
  async #getExports() {
    const fileSystem = this.getParent().getFileSystem()
    return fileSystem.getFileExports(this.absolutePath)
  }

  /** Get all exports from the JavaScript file. */
  async getExports() {
    const fileExports = await this.#getExports()

    const exports = await Promise.all(
      fileExports.map((exportMetadata) =>
        this.getExport(exportMetadata.name as Extract<keyof Types, string>)
      )
    )

    // Optionally filter out @internal exports based on tsconfig `stripInternal`
    const fileSystem = this.getParent().getFileSystem()
    if (!fileSystem.shouldStripInternal()) {
      return exports
    }

    // filter out @internal exports
    let writeIndex = 0
    for (let readIndex = 0; readIndex < exports.length; readIndex++) {
      const fileExport = exports[readIndex]
      const tags = fileExport.getTags()
      if (!tags || tags.length === 0) {
        exports[writeIndex++] = fileExport
        continue
      }
      let isPublic = false
      for (let tagIndex = 0; tagIndex < tags.length; tagIndex++) {
        const tag = tags[tagIndex]
        if (!tag || tag.name !== 'internal') {
          isPublic = true
          break
        }
      }
      if (isPublic) {
        exports[writeIndex++] = fileExport
      }
    }
    exports.length = writeIndex
    return exports
  }

  /** Get a JavaScript file export by name. */
  async getExport<const ExportName extends Extract<keyof Types, string>>(
    name: ExportName
  ): Promise<ModuleExport<Types[ExportName]>> {
    if (await this.hasExport(name)) {
      if (this.#exports.has(name)) {
        return this.#exports.get(name)!
      }

      const fileExport = await ModuleExport.init<Types[ExportName]>(
        name,
        this as any,
        this.#loader,
        this.#slugCasing
      )

      this.#exports.set(name, fileExport)

      return fileExport
    }

    if (this.#loader === undefined) {
      throw new Error(
        `[renoun] JavaScript file export "${name}" could not be determined statically or at runtime for path "${this.absolutePath}". Ensure the directory has a loader defined for resolving "${this.extension}" files.`
      )
    }

    throw new ModuleExportNotFoundError(this.absolutePath, name, 'JavaScript')
  }

  /** Get a named export from the JavaScript file. */
  async getNamedExport<const ExportName extends Extract<keyof Types, string>>(
    name: ExportName
  ): Promise<ModuleExport<Types[ExportName]>> {
    return this.getExport(name)
  }

  /** Get the default export from the JavaScript file. */
  async getDefaultExport(
    this: Types extends { default: infer _DefaultType }
      ? JavaScriptFile<Types, DirectoryTypes, Path, Extension>
      : never
  ): Promise<
    ModuleExport<
      Types extends { default: infer DefaultType } ? DefaultType : never
    >
  > {
    return (
      this as JavaScriptFile<Types, DirectoryTypes, Path, Extension>
    ).getExport<any>('default')
  }

  /** Get the start position of an export in the JavaScript file. */
  async getExportLocation(name: string) {
    const fileExports = await this.#getExports()
    return fileExports.find((exportMetadata) => exportMetadata.name === name)
  }

  /** Get the runtime value of an export in the JavaScript file. */
  async getExportValue<const ExportName extends Extract<keyof Types, string>>(
    name: ExportName
  ): Promise<Types[ExportName]>
  async getExportValue(name: string): Promise<any> {
    const fileExport = await this.getExport(name as any)
    return (await fileExport.getValue()) as any
  }

  /** Get an outline derived from regions and exports in the JavaScript file. */
  async getSections(): Promise<Section[]> {
    if (!this.#sections) {
      const [regions, fileExports] = await Promise.all([
        this.getRegions(),
        this.getExports(),
      ])

      const sections: Array<{
        section: Section
        line: number
      }> = []
      const regionExportNames = new Map<FileRegion, string[]>()

      for (const region of regions) {
        regionExportNames.set(region, [])
      }

      const ungroupedExports: Array<{
        exportItem: ModuleExport<any>
        line: number
      }> = []

      const findRegionForLine = (line: number) =>
        regions.find(
          (region) =>
            line >= region.position.start.line &&
            line <= region.position.end.line
        )

      for (const fileExport of fileExports) {
        const position = fileExport.getPosition()
        const line = position?.start.line
        const region = line !== undefined ? findRegionForLine(line) : undefined

        if (region) {
          const names = regionExportNames.get(region)
          if (names) {
            names.push(fileExport.name)
          }
        } else {
          ungroupedExports.push({
            exportItem: fileExport,
            line: line ?? Number.POSITIVE_INFINITY,
          })
        }
      }

      for (const region of regions) {
        const exportNames = regionExportNames.get(region) ?? []
        const title = region.bannerText
        const section: Section = {
          id: createSlug(title, this.#slugCasing),
          title,
          children: exportNames.map((name) => ({
            // `Reference` anchors use the actual export name (case-sensitive),
            // so the TOC must link using the unslugified identifier.
            id: name,
            title: name,
          })),
        }
        sections.push({
          section,
          line: region.position.start.line,
        })
      }

      for (const { exportItem, line } of ungroupedExports) {
        sections.push({
          section: {
            // Keep hash ids aligned with `Reference`'s rendered anchor ids.
            id: exportItem.name,
            title: exportItem.name,
          },
          line,
        })
      }

      sections.sort((a, b) => a.line - b.line)
      this.#sections = sections.map(({ section }) => section)
    }

    return this.#sections
  }

  /** Get the `//#region` spans in the JavaScript file. */
  async getRegions(): Promise<FileRegion[]> {
    const fileSystem = this.getParent().getFileSystem()
    return fileSystem.getFileRegions(this.absolutePath)
  }

  override async getStructure(): Promise<FileStructure> {
    const base = await this.getFileStructureBase()
    const fileExports = await this.getExports()
    const exports: ModuleExportStructure[] = []

    for (const fileExport of fileExports) {
      if (typeof (fileExport as any).getStructure === 'function') {
        const exportStructure = await (fileExport as any).getStructure()
        exports.push(exportStructure)
      }
    }

    return {
      ...base,
      exports: exports.length > 0 ? exports : undefined,
    }
  }

  /** Check if an export exists statically in the JavaScript file. */
  async #hasStaticExport(name: string): Promise<boolean> {
    try {
      const location = await this.getExportLocation(name)
      return location !== undefined
    } catch {
      return false
    }
  }

  /** Check if an export exists at runtime in the JavaScript file. */
  async #hasRuntimeExport(name: string) {
    try {
      const fileModule = await this.#getModule()
      return name in fileModule
    } catch {
      return false
    }
  }

  /** Check if an export exists in the JavaScript file statically or at runtime. */
  async hasExport(name: string): Promise<boolean> {
    if (await this.#hasStaticExport(name)) {
      return true
    }

    if (await this.#hasRuntimeExport(name)) {
      return true
    }

    return false
  }
}

/** An MDX file export. */
export class MDXModuleExport<Value> {
  #name: string
  #file: MDXFile<any>
  #loader?: ModuleLoader<any>
  #getModuleFn?: () => Promise<any>
  #slugCasing: SlugCasing
  #staticPromise?: Promise<Value>
  #runtimePromise?: Promise<Value>

  constructor(
    name: string,
    file: MDXFile<any>,
    loader?: ModuleLoader<any>,
    slugCasing?: SlugCasing,
    getModuleFn?: () => Promise<any>
  ) {
    this.#name = name
    this.#file = file
    this.#loader = loader
    this.#slugCasing = slugCasing ?? 'kebab'
    this.#getModuleFn = getModuleFn
  }

  get name() {
    return this.#name
  }

  get title() {
    return formatNameAsTitle(this.name)
  }

  get slug() {
    return createSlug(this.name, this.#slugCasing)
  }

  getEditorUri(options?: Omit<GetEditorUriOptions, 'path'>) {
    return this.#file.getEditorUri(options)
  }

  getEditUrl(
    options?: Pick<GetFileUrlOptions, 'ref'> & {
      repository?: RepositoryConfig | string | Repository
    }
  ) {
    return this.#file.getEditUrl(options)
  }

  getSourceUrl(
    options?: Pick<GetFileUrlOptions, 'ref'> & {
      repository?: RepositoryConfig | string | Repository
    }
  ) {
    return this.#file.getSourceUrl(options)
  }

  getReleaseUrl(options?: SourceReleaseUrlOptions) {
    return this.#file.getReleaseUrl(options)
  }

  getRelease(options?: SourceReleaseOptions) {
    return this.#file.getRelease(options)
  }

  /** Parse and validate an export value using the configured schema if available. */
  parseExportValue(name: string, value: any): any {
    const schemaOption =
      this.#file.getSchema() ??
      resolveDirectorySchemaOption(this.#file.getParent().getSchema(), 'mdx')

    // Module-level schemas are applied when loading the module.
    if (!schemaOption || isStandardSchema(schemaOption)) {
      return value
    }

    return validateExportValueWithExportSchemaMap(
      schemaOption,
      name,
      value,
      this.#file.absolutePath
    )
  }

  /** Attempt to return a literal value for this export if it can be determined statically. */
  async getStaticValue(): Promise<Value> {
    if (process.env.NODE_ENV === 'production') {
      if (!this.#staticPromise) {
        this.#staticPromise = this.#getStaticValue()
      }
      return this.#staticPromise
    }
    return this.#getStaticValue()
  }

  async #getStaticValue(): Promise<Value> {
    const value = await this.#file.getStaticExportValue(this.#name)

    if (value === undefined) {
      throw new Error(
        `[renoun] Export cannot be statically analyzed at file path "${this.#file.relativePath}".`
      )
    }

    return this.parseExportValue(this.#name, value)
  }

  /**
   * Get the runtime value of the export. An error will be thrown if the export
   * is not found or the configured schema validation for the MDX file fails.
   */
  async getRuntimeValue(): Promise<Value> {
    if (process.env.NODE_ENV === 'production') {
      if (!this.#runtimePromise) {
        this.#runtimePromise = this.#getRuntimeValue()
      }
      return this.#runtimePromise
    }
    return this.#getRuntimeValue()
  }

  async #getRuntimeValue(): Promise<Value> {
    const fileModule = await this.#getModule()

    if (this.#name in fileModule === false) {
      throw new ModuleExportNotFoundError(
        this.#file.absolutePath,
        String(this.#name),
        'MDX'
      )
    }

    const fileModuleExport = fileModule[this.#name]

    if (fileModuleExport === undefined) {
      throw new ModuleExportNotFoundError(
        this.#file.absolutePath,
        String(this.#name),
        'MDX'
      )
    }

    return this.parseExportValue(this.#name, fileModuleExport)
  }

  /** Get the value of this export, preferring a static value and falling back to runtime if available. */
  async getValue(): Promise<Value> {
    try {
      const staticValue = await this.getStaticValue()

      if (staticValue !== undefined) {
        return staticValue as Value
      }
    } catch {
      // ignore and fall back to runtime if possible
    }

    return this.getRuntimeValue()
  }

  #getModule() {
    if (this.#getModuleFn) {
      return this.#getModuleFn()
    }

    if (this.#loader === undefined) {
      const parentPath = this.#file.getParent().workspacePath

      throw new Error(
        `[renoun] An mdx loader for the parent Directory at ${parentPath} is not defined.`
      )
    }

    const path = removeExtension(this.#file.relativePath)

    const loader = this.#loader

    return (async () => {
      const moduleValue = await unwrapModuleResult<any>(
        loader(path, this.#file)
      )

      const schemaOption =
        this.#file.getSchema() ??
        resolveDirectorySchemaOption(this.#file.getParent().getSchema(), 'mdx')

      if (schemaOption && isStandardSchema(schemaOption)) {
        return applyModuleSchemaToModule(
          schemaOption,
          moduleValue,
          this.#file.absolutePath
        )
      }

      return moduleValue
    })()
  }
}

/** Options for an MDX file in the file system. */
export interface MDXFileOptions<
  Types extends Record<string, any>,
  DirectoryTypes extends Record<string, any>,
  Path extends string,
> extends FileOptions<DirectoryTypes, Path> {
  loader?: ModuleLoader<{ default: MDXContent } & Types>
}

/** An MDX file in the file system. */
export class MDXFile<
  Types extends Record<string, any> = { default: MDXContent },
  DirectoryTypes extends Record<string, any> = Record<string, any>,
  const Path extends string = string,
  Extension extends string = ExtractFileExtension<Path>,
> extends File<DirectoryTypes, Path, Extension> {
  #exports = new Map<string, MDXModuleExport<any>>()
  #loader?: ModuleLoader<{ default: MDXContent } & Types>
  #slugCasing?: SlugCasing
  #staticExportValues?: Map<string, unknown>
  #sections?: ContentSection[]
  #modulePromise?: Promise<any>
  #rawSource?: Promise<string>
  #parsedSource?: Promise<FrontMatterParseResult>
  #resolvingFrontMatter?: boolean

  constructor({
    loader,
    ...fileOptions
  }: MDXFileOptions<{ default: MDXContent } & Types, DirectoryTypes, Path>) {
    super(fileOptions)

    if (loader === undefined) {
      this.#loader = defaultLoaders.mdx
    } else {
      this.#loader = loader
    }

    this.#slugCasing = fileOptions.slugCasing ?? 'kebab'
  }

  async #getRawSource() {
    if (!this.#rawSource) {
      this.#rawSource = super.text()
    }
    return this.#rawSource
  }

  async #getSourceWithFrontMatter() {
    if (!this.#parsedSource) {
      this.#parsedSource = (async () => {
        const source = await this.#getRawSource()
        return parseFrontMatter(source)
      })()
    }

    return this.#parsedSource
  }

  override async text(): Promise<string> {
    const result = await this.#getSourceWithFrontMatter()
    return result.content
  }

  async getFrontMatter(): Promise<Record<string, unknown> | undefined> {
    if (!this.#resolvingFrontMatter) {
      try {
        this.#resolvingFrontMatter = true
        const frontMatter = (await this.getExportValue(
          'frontMatter' as any
        )) as Record<string, unknown> | undefined

        if (frontMatter !== undefined) {
          return frontMatter
        }
      } catch (error) {
        if (!(error instanceof ModuleExportNotFoundError)) {
          throw error
        }
      } finally {
        this.#resolvingFrontMatter = false
      }
    }

    const result = await this.#getSourceWithFrontMatter()

    return result.frontMatter
  }

  async getChatGPTUrl(): Promise<string> {
    const q = await this.#getRawSource()
    const params = new URLSearchParams({ hints: 'search', q })

    return `https://chat.openai.com/?${params}`
  }

  async getClaudeUrl(): Promise<string> {
    const q = await this.#getRawSource()
    const params = new URLSearchParams({ hints: 'search', q })

    return `https://claude.ai/new?${params}`
  }

  async getExports() {
    const fileModule = await this.#getModule()
    const exportNames = Object.keys(fileModule)

    for (const name of exportNames) {
      if (!this.#exports.has(name)) {
        const mdxExport = new MDXModuleExport(
          name,
          this as MDXFile<any>,
          this.#loader,
          this.#slugCasing,
          () => this.#getModule()
        )
        this.#exports.set(name, mdxExport)
      }
    }

    return Array.from(this.#exports.values())
  }

  async getExport<
    const ExportName extends 'default' | Extract<keyof Types, string>,
  >(
    name: ExportName
  ): Promise<MDXModuleExport<({ default: MDXContent } & Types)[ExportName]>> {
    if (this.#exports.has(name)) {
      return this.#exports.get(name)!
    }

    const fileModule = await this.#getModule()

    if (!(name in fileModule)) {
      throw new ModuleExportNotFoundError(this.absolutePath, name, 'MDX')
    }

    const fileExport = new MDXModuleExport<
      ({ default: MDXContent } & Types)[ExportName]
    >(name, this as MDXFile<any>, this.#loader, this.#slugCasing, () =>
      this.#getModule()
    )

    this.#exports.set(name, fileExport)

    return fileExport
  }

  /** Get a named export from the MDX file. */
  async getNamedExport<const ExportName extends Extract<keyof Types, string>>(
    name: ExportName
  ): Promise<MDXModuleExport<Types[ExportName]>> {
    return this.getExport(name)
  }

  /** Get the default export from the MDX file. */
  async getDefaultExport(): Promise<MDXContent> {
    return this.getExport('default').then((fileExport) => fileExport.getValue())
  }

  /** Get the rendered MDX content. */
  async getContent(): Promise<MDXContent> {
    return this.getDefaultExport()
  }

  /** Get sections parsed from the MDX content based on headings. */
  async getSections(): Promise<ContentSection[]> {
    if (!this.#sections) {
      try {
        this.#sections = await this.getExport('sections' as any).then(
          (fileExport) => fileExport.getValue()
        )
      } catch (error) {
        if (!(error instanceof ModuleExportNotFoundError)) {
          throw error
        }
      }

      if (!this.#sections) {
        const source = await this.text()
        this.#sections = getMDXSections(source) as ContentSection[]
      }
    }

    return this.#sections ?? []
  }

  override async getStructure(): Promise<FileStructure> {
    const base = await this.getFileStructureBase()
    const [frontMatter, sections] = await Promise.all([
      this.getFrontMatter().catch(() => undefined),
      this.getSections().catch(() => undefined),
    ])
    const description =
      (frontMatter?.['description'] as string | undefined) ??
      (sections && sections.length > 0 ? sections[0]!.title : undefined)

    return {
      ...base,
      frontMatter,
      sections,
      description,
    }
  }

  /** Check if an export exists at runtime in the MDX file. */
  async hasExport(name: string): Promise<boolean> {
    const fileModule = await this.#getModule()
    return name in fileModule
  }

  /** Get the runtime value of an export in the MDX file. */
  async getExportValue<
    const ExportName extends 'default' | Extract<keyof Types, string>,
  >(name: ExportName): Promise<({ default: MDXContent } & Types)[ExportName]>
  async getExportValue(name: string): Promise<any> {
    if (name === 'frontmatter') {
      // Prefer an explicit `frontmatter` export if it exists.
      try {
        const exportValue = await this.getExport('frontmatter' as any).then(
          (fileExport) => fileExport.getValue()
        )
        if (exportValue !== undefined) {
          return exportValue
        }
      } catch (error) {
        if (!(error instanceof ModuleExportNotFoundError)) {
          throw error
        }
      }

      // Fall back to derived front matter (from `frontMatter` export or parsed source).
      return (await this.getFrontMatter()) ?? {}
    }

    const fileExport = await this.getExport(name as any)
    return (await fileExport.getValue()) as any
  }

  async #getStaticExportValues() {
    if (!this.#staticExportValues) {
      const source = await this.text()
      this.#staticExportValues = getMDXExportStaticValues(source)
    }
    return this.#staticExportValues
  }

  /** Attempt to return a literal value for a named export if it can be determined statically. */
  async getStaticExportValue(name: string) {
    const values = await this.#getStaticExportValues()
    return values.get(name)
  }

  #getModule() {
    if (this.#loader === undefined) {
      const parentPath = this.getParent().relativePath

      throw new Error(
        `[renoun] An mdx loader for the parent Directory at ${parentPath} is not defined.`
      )
    }

    const path = removeExtension(this.relativePath)
    const loader = this.#loader
    let executeModuleLoader: () => Promise<any>

    executeModuleLoader = async () => {
      const moduleValue = await unwrapModuleResult(loader(path, this))
      const schemaOption =
        this.getSchema() ??
        resolveDirectorySchemaOption(this.getParent().getSchema(), 'mdx')

      if (schemaOption && isStandardSchema(schemaOption)) {
        return applyModuleSchemaToModule(
          schemaOption,
          moduleValue,
          this.absolutePath
        )
      }

      return moduleValue
    }

    // In production we cache the resolved module for speed.
    // In development we only dedupe in-flight loads to avoid races, but we
    // clear the cache once the promise settles to preserve HMR behavior.
    if (this.#modulePromise) {
      return this.#modulePromise
    }

    const promise = executeModuleLoader()
    this.#modulePromise = promise

    if (process.env.NODE_ENV !== 'production') {
      promise.finally(() => {
        if (this.#modulePromise === promise) {
          this.#modulePromise = undefined
        }
      })
    }

    return promise
  }
}

/** Options for a Markdown file in the file system. */
export interface MarkdownFileOptions<
  Types extends Record<string, any>,
  DirectoryTypes extends Record<string, any>,
  Path extends string,
  SchemaOption extends DirectorySchemaOption | undefined = undefined,
> extends FileOptions<DirectoryTypes, Path, SchemaOption> {
  loader?: ModuleLoader<{ default: MDXContent } & Types>
}

/** A Markdown file in the file system. */
export class MarkdownFile<
  Types extends Record<string, any> = { default: MDXContent },
  DirectoryTypes extends Record<string, any> = Record<string, any>,
  const Path extends string = string,
  Extension extends string = ExtractFileExtension<Path>,
  SchemaOption extends DirectorySchemaOption | undefined = undefined,
> extends File<DirectoryTypes, Path, Extension> {
  #loader: ModuleLoader<{ default: MDXContent } & Types>
  #sections?: ContentSection[]
  #modulePromise?: Promise<any>
  #rawSource?: Promise<string>
  #parsedSource?: Promise<FrontMatterParseResult>
  #resolvingFrontMatter?: boolean

  constructor({
    loader,
    ...fileOptions
  }: MarkdownFileOptions<
    { default: MDXContent } & Types,
    DirectoryTypes,
    Path,
    SchemaOption
  >) {
    super(fileOptions)
    this.#loader = loader ?? defaultLoaders.md
  }

  async #getRawSource() {
    if (!this.#rawSource) {
      this.#rawSource = super.text()
    }
    return this.#rawSource
  }

  async #getSourceWithFrontMatter() {
    if (!this.#parsedSource) {
      this.#parsedSource = (async () => {
        const source = await this.#getRawSource()
        return parseFrontMatter(source)
      })()
    }

    return this.#parsedSource
  }

  override async text(): Promise<string> {
    const result = await this.#getSourceWithFrontMatter()
    return result.content
  }

  async getFrontMatter(): Promise<Record<string, unknown> | undefined> {
    if (!this.#resolvingFrontMatter) {
      try {
        this.#resolvingFrontMatter = true
        const frontMatter = (await this.getExportValue(
          'frontMatter' as any
        )) as Record<string, unknown> | undefined

        if (frontMatter !== undefined) {
          return frontMatter
        }
      } catch (error) {
        if (!(error instanceof ModuleExportNotFoundError)) {
          throw error
        }
      } finally {
        this.#resolvingFrontMatter = false
      }
    }

    const result = await this.#getSourceWithFrontMatter()
    return result.frontMatter
  }

  async getChatGPTUrl(): Promise<string> {
    const q = await this.#getRawSource()
    const params = new URLSearchParams({ hints: 'search', q })

    return `https://chat.openai.com/?${params}`
  }

  async getClaudeUrl(): Promise<string> {
    const q = await this.#getRawSource()
    const params = new URLSearchParams({ hints: 'search', q })

    return `https://claude.ai/new?${params}`
  }

  #getModule() {
    const path = removeExtension(this.relativePath)
    const loader = this.#loader

    const executeModuleLoader = async () => {
      const moduleValue = await unwrapModuleResult(loader(path, this))
      const schemaOption =
        this.getSchema() ??
        resolveDirectorySchemaOption(this.getParent().getSchema(), 'md')

      if (schemaOption && isStandardSchema(schemaOption)) {
        return applyModuleSchemaToModule(
          schemaOption,
          moduleValue,
          this.absolutePath
        )
      }

      return moduleValue
    }

    if (process.env.NODE_ENV === 'production') {
      if (this.#modulePromise) {
        return this.#modulePromise
      }
      this.#modulePromise = executeModuleLoader()
      return this.#modulePromise
    }

    return executeModuleLoader()
  }

  /** Get the rendered markdown content. */
  async getContent(): Promise<MDXContent> {
    return this.#getModule().then((module) => module.default)
  }

  /** Get sections parsed from the markdown content based on headings. */
  async getSections(): Promise<ContentSection[]> {
    if (!this.#sections) {
      const source = await this.text()
      this.#sections = getMarkdownSections(source) as ContentSection[]
    }
    return this.#sections ?? []
  }

  override async getStructure(): Promise<FileStructure> {
    const base = await this.getFileStructureBase()
    const [frontMatter, sections] = await Promise.all([
      this.getFrontMatter().catch(() => undefined),
      this.getSections().catch(() => undefined),
    ])
    const description =
      (frontMatter?.['description'] as string | undefined) ??
      (sections && sections.length > 0 ? sections[0]!.title : undefined)

    return {
      ...base,
      frontMatter,
      sections,
      description,
    }
  }

  /** Get the runtime value of an export in the Markdown file. (Permissive signature for union compatibility.) */
  parseExportValue(name: string, value: any): any {
    const schemaOption =
      this.getSchema() ??
      resolveDirectorySchemaOption(this.getParent().getSchema(), 'md')

    // Module-level schemas are applied when loading the module.
    if (!schemaOption || isStandardSchema(schemaOption)) {
      return value
    }

    return validateExportValueWithExportSchemaMap(
      schemaOption,
      name,
      value,
      this.absolutePath
    )
  }

  async getExportValue<
    const ExportName extends
      | 'default'
      | Extract<
          keyof ApplyFileSchemaOption<
            { default: MDXContent } & Types,
            SchemaOption
          >,
          string
        >,
  >(
    name: ExportName
  ): Promise<
    ApplyFileSchemaOption<
      { default: MDXContent } & Types,
      SchemaOption
    >[ExportName]
  >
  async getExportValue(name: string): Promise<any> {
    const fileModule = await this.#getModule()
    if (!(name in fileModule)) {
      throw new ModuleExportNotFoundError(
        this.absolutePath,
        name as any,
        'Markdown'
      )
    }
    return this.parseExportValue(name, fileModule[name])
  }
}

type Narrowed<Filter> = Filter extends (entry: any) => entry is infer ReturnType
  ? ReturnType
  : never
type ResolveDirectoryFilterEntries<
  Filter,
  Types extends Record<string, any> = Record<string, any>,
> = Filter extends string
  ? Filter extends `**${string}`
    ? Directory<Types> | FileWithExtension<Types, ExtractFileExtension<Filter>>
    : FileWithExtension<Types, ExtractFileExtension<Filter>>
  : [Narrowed<Filter>] extends [never]
    ? FileSystemEntry<Types>
    : Narrowed<Filter>

type DirectoryEntriesRecursiveOption<Filter> = Filter extends string
  ? Filter extends `**${string}`
    ? boolean
    : undefined
  : boolean

type NoInferType<T> = [T][T extends any ? 0 : never]

export type DirectoryFilter<
  Entry extends FileSystemEntry<any>,
  Types extends Record<string, any>,
> =
  | ((entry: FileSystemEntry<Types>) => entry is Entry)
  | ((entry: FileSystemEntry<Types>) => Promise<boolean> | boolean)
  | string

export interface DirectoryOptions<
  Types extends Record<string, any> = {},
  LoaderTypes extends WithDefaultTypes<Types> = WithDefaultTypes<Types>,
  Loaders extends DirectoryLoader = DirectoryLoader,
  Schema extends DirectorySchema | undefined = DirectorySchema | undefined,
  Filter extends
    | DirectoryFilter<
        FileSystemEntry<ApplyDirectorySchema<LoaderTypes, Schema>>,
        ApplyDirectorySchema<LoaderTypes, Schema>
      >
    | undefined =
    | DirectoryFilter<
        FileSystemEntry<ApplyDirectorySchema<LoaderTypes, Schema>>,
        ApplyDirectorySchema<LoaderTypes, Schema>
      >
    | undefined,
> {
  /** Directory path in the workspace. */
  path?: PathLike

  /** Filter entries with a minimatch pattern or predicate. */
  filter?: Filter

  /** Directory schema (global or per-extension). */
  schema?: Schema

  /** Extension loaders, a runtime loader, or an `import.meta.glob(...)` map. */
  loader?: Loaders | (() => Loaders)

  /** Base route prepended to descendant `getPathname()` results. */
  basePathname?: string | null

  /** Uses the closest `tsconfig.json` path for static analysis and type-checking. */
  tsConfigPath?: string

  /** Slug casing applied to route segments. */
  slugCasing?: SlugCasing

  /** Custom file‑system adapter. */
  fileSystem?: FileSystem

  /** Sort callback applied at *each* directory depth. */
  sort?: SortDescriptor<
    FileSystemEntry<ApplyDirectorySchema<LoaderTypes, NoInferType<Schema>>>
  >

  /** The repository used to generate source URLs. */
  repository?: Repository | RepositoryConfig | string
}

const enum DirectorySnapshotOptionBit {
  Recursive = 1 << 0,
  IncludeDirectoryNamedFiles = 1 << 1,
  IncludeIndexAndReadmeFiles = 1 << 2,
  IncludeGitIgnoredFiles = 1 << 3,
  IncludeTsConfigExcludedFiles = 1 << 4,
  IncludeHiddenFiles = 1 << 5,
}

interface NormalizedDirectoryEntriesOptions {
  recursive: boolean
  includeDirectoryNamedFiles: boolean
  includeIndexAndReadmeFiles: boolean
  includeGitIgnoredFiles: boolean
  includeTsConfigExcludedFiles: boolean
  includeHiddenFiles: boolean
}

type DirectorySnapshotMetadataEntry<LoaderTypes extends Record<string, any>> =
  | FileEntryMetadata<LoaderTypes>
  | DirectoryEntryMetadata<LoaderTypes>

interface FileEntryMetadata<LoaderTypes extends Record<string, any>> {
  type: 'file'
  entry: FileSystemEntry<LoaderTypes>
  includeInFinal: boolean
  isGitIgnored: boolean
  isIndexOrReadme: boolean
  isTsConfigExcluded: boolean
  isDirectoryNamedFile: boolean
  passesFilter: boolean
  shouldIncludeFile: boolean
}

interface DirectoryEntryMetadata<LoaderTypes extends Record<string, any>> {
  type: 'directory'
  entry: Directory<LoaderTypes>
  includeInFinal: boolean
  passesFilterSelf: boolean
  snapshot: DirectorySnapshot<
    Directory<LoaderTypes>,
    FileSystemEntry<LoaderTypes>
  >
}

function createOptionsMask(options: NormalizedDirectoryEntriesOptions) {
  let mask = 0

  if (options.recursive) {
    mask |= DirectorySnapshotOptionBit.Recursive
  }

  if (options.includeDirectoryNamedFiles) {
    mask |= DirectorySnapshotOptionBit.IncludeDirectoryNamedFiles
  }

  if (options.includeIndexAndReadmeFiles) {
    mask |= DirectorySnapshotOptionBit.IncludeIndexAndReadmeFiles
  }

  if (options.includeGitIgnoredFiles) {
    mask |= DirectorySnapshotOptionBit.IncludeGitIgnoredFiles
  }

  if (options.includeTsConfigExcludedFiles) {
    mask |= DirectorySnapshotOptionBit.IncludeTsConfigExcludedFiles
  }

  if (options.includeHiddenFiles) {
    mask |= DirectorySnapshotOptionBit.IncludeHiddenFiles
  }

  return mask
}

/** A directory containing files and subdirectories in the file system. */
export class Directory<
  Types extends Record<string, any> = {},
  LoaderTypes extends WithDefaultTypes<Types> = WithDefaultTypes<Types>,
  Loaders extends DirectoryLoader = DirectoryLoader,
  Schema extends DirectorySchema | undefined = DirectorySchema | undefined,
  Filter extends
    | DirectoryFilter<
        FileSystemEntry<ApplyDirectorySchema<LoaderTypes, Schema>>,
        ApplyDirectorySchema<LoaderTypes, Schema>
      >
    | undefined =
    | DirectoryFilter<
        FileSystemEntry<ApplyDirectorySchema<LoaderTypes, Schema>>,
        ApplyDirectorySchema<LoaderTypes, Schema>
      >
    | undefined,
> {
  #path: string
  #rootPath?: string
  #basePathname?: string | null
  #tsConfigPath?: string
  #slugCasing: SlugCasing
  #schema?: DirectorySchema
  #loader?: Loaders | (() => Loaders)
  #resolvedLoaders?: ModuleLoaders | ModuleRuntimeLoader<any>
  #directory?: Directory<any, any, any>
  #fileSystem: FileSystem | undefined
  #repository: Repository | undefined
  #repositoryOption?: Repository | RepositoryConfig | string
  #hasExplicitLoader = false
  #filterPattern?: string
  #filter?:
    | ((
        entry: FileSystemEntry<ApplyDirectorySchema<LoaderTypes, Schema>>
      ) => entry is FileSystemEntry<ApplyDirectorySchema<LoaderTypes, Schema>>)
    | ((
        entry: FileSystemEntry<ApplyDirectorySchema<LoaderTypes, Schema>>
      ) => Promise<boolean> | boolean)
    | Minimatch
  #filterCache?: WeakMap<
    FileSystemEntry<ApplyDirectorySchema<LoaderTypes, Schema>>,
    boolean
  >
  #simpleFilter?: { recursive: boolean; extensions: Set<string> }
  #sort?: any

  constructor(
    options?: DirectoryOptions<Types, LoaderTypes, Loaders, Schema, Filter>
  ) {
    if (options === undefined) {
      this.#path = '.'
      this.#slugCasing = 'kebab'
      this.#tsConfigPath = 'tsconfig.json'
    } else {
      if (options.path) {
        const resolved = resolveSchemePath(options.path)
        if (resolved.startsWith('/')) {
          // If the resolved path is inside the workspace, store a workspace‑relative path
          const workspaceRoot = normalizeSlashes(getRootDirectory())
          const absoluteResolved = normalizeSlashes(resolved)
          if (
            absoluteResolved === workspaceRoot ||
            absoluteResolved.startsWith(
              workspaceRoot.endsWith('/') ? workspaceRoot : `${workspaceRoot}/`
            )
          ) {
            // Store absolute (workspace‑anchored) path to avoid cwd coupling
            this.#path = absoluteResolved
          } else {
            // Keep external absolute path as is
            this.#path = resolved
          }
        } else {
          this.#path = ensureRelativePath(resolved)
        }
      } else {
        this.#path = '.'
      }
      this.#schema = options.schema
      this.#loader = options.loader
      this.#hasExplicitLoader = options.loader !== undefined
      this.#basePathname =
        options.basePathname === undefined
          ? this.#directory
            ? this.#directory.slug
            : this.slug
          : options.basePathname
      this.#tsConfigPath =
        options.tsConfigPath ??
        getClosestFile('tsconfig.json', this.#path) ??
        'tsconfig.json'
      this.#slugCasing = options.slugCasing ?? 'kebab'
      this.#fileSystem = options.fileSystem
      this.#repositoryOption = options.repository
      if (typeof options.filter === 'string') {
        this.#filterPattern = options.filter

        // Fast-path common extension-only patterns e.g. *.tsx, **/*.mdx, etc.
        const pattern = parseSimpleGlobPattern(options.filter)
        if (pattern) {
          const extensions = new Set(pattern.extensions)
          this.#simpleFilter = {
            recursive: pattern.recursive,
            extensions,
          }

          // Build a cheap predicate and skip Minimatch entirely
          this.#filter = (entry: FileSystemEntry<any>) => {
            if (entry instanceof Directory) {
              return pattern.recursive
            }
            if (entry instanceof File) {
              return extensions.has(entry.extension)
            }
            return true
          }
        } else {
          this.#filter = new Minimatch(options.filter, { dot: true })
        }
      } else {
        this.#filter = options.filter
      }

      this.#sort = options.sort
    }
  }

  /** Returns the glob filter pattern kind for this directory if defined. */
  getFilterPatternKind(): 'recursive' | 'shallow' | null {
    if (!this.#filterPattern) {
      return null
    }
    return this.#filterPattern.includes('**') ? 'recursive' : 'shallow'
  }

  async #passesFilter(entry: FileSystemEntry<LoaderTypes>): Promise<boolean> {
    if (!this.#filter) {
      return true
    }

    if (this.#filter instanceof Minimatch) {
      const isRecursivePattern = this.#filterPattern!.includes('**')

      if (isRecursivePattern && entry instanceof Directory) {
        return true
      }

      return this.#filter.match(entry.relativePath)
    }

    // Cache decisions for non-Minimatch predicates (can be async/expensive)
    if (!this.#filterCache) {
      this.#filterCache = new WeakMap()
    }

    const cached = this.#filterCache.get(entry)
    if (cached !== undefined) {
      return cached
    }

    const passes = await this.#filter(entry)
    this.#filterCache.set(entry, passes)
    return passes
  }

  async #shouldIncludeFile(
    entry: FileSystemEntry<LoaderTypes>
  ): Promise<boolean> {
    if (entry instanceof JavaScriptFile) {
      const extension = entry.extension

      if (extension === 'ts' || extension === 'tsx') {
        const fileSystem = entry.getParent().getFileSystem()
        if (!fileSystem.shouldStripInternal()) {
          return true
        }
        const allExports = await fileSystem.getFileExports(entry.absolutePath)
        if (allExports.length === 0) {
          return true
        }
        const filtered = await entry.getExports()
        return filtered.length > 0
      }
    }

    return true
  }

  /** Duplicate the directory with the same initial options. */
  #duplicate(options?: DirectoryOptions<any, any, any, any, any>) {
    const directory = new Directory<
      Types,
      LoaderTypes,
      Loaders,
      Schema,
      Filter
    >({
      path: this.#path,
      fileSystem: this.#fileSystem,
      basePathname: this.#basePathname,
      tsConfigPath: this.#tsConfigPath,
      slugCasing: this.#slugCasing,
      schema: this.#schema,
      loader: this.#loader,
      filter: this.#filter as any,
      sort: this.#sort,
      ...options,
    })

    directory.#directory = this
    directory.#filterPattern = this.#filterPattern
    directory.#filterCache = this.#filterCache
    directory.#simpleFilter = this.#simpleFilter
    directory.#repositoryOption = this.#repositoryOption
    directory.#repository = this.#repository
    directory.#rootPath = this.getRootPath()
    directory.#pathLookup = this.#pathLookup
    directory.#resolvedLoaders = this.#resolvedLoaders
    directory.#hasExplicitLoader = this.#hasExplicitLoader

    return directory
  }

  /** Resolve the loaders map when a factory is provided and cache the result. */
  #getLoaders(): ModuleLoaders | ModuleRuntimeLoader<any> | undefined {
    if (!this.#loader) {
      return undefined
    }
    if (typeof this.#loader === 'function') {
      if (isRuntimeLoader(this.#loader)) {
        return this.#loader
      }

      if (!this.#resolvedLoaders) {
        const resolved = (this.#loader as () => Loaders)()

        if (resolved === undefined && this.#hasExplicitLoader) {
          throw new Error(
            `[renoun] A loader was provided for directory "${this.#path}" but it did not resolve. Ensure the loader factory returns a loader or remove the loader option.`
          )
        }

        if (isGlobModuleMap(resolved)) {
          this.#resolvedLoaders = createGlobRuntimeLoader(resolved)
        } else {
          this.#resolvedLoaders = isRuntimeLoader(resolved)
            ? (resolved as any)
            : (resolved as any)
        }
      }

      return this.#resolvedLoaders
    }

    if (isGlobModuleMap(this.#loader)) {
      if (!this.#resolvedLoaders) {
        this.#resolvedLoaders = createGlobRuntimeLoader(this.#loader)
      }
      return this.#resolvedLoaders
    }

    const loaderMap = this.#loader as ModuleLoaders

    if (this.#hasExplicitLoader && Object.keys(loaderMap).length === 0) {
      throw new Error(
        `[renoun] A loader was provided for directory "${this.#path}" but it resolved to an empty loader map. Ensure your loader map includes extensions or remove the loader option.`
      )
    }

    return loaderMap
  }

  #resolveLoaderForExtension(
    extension: string
  ): ModuleLoader<any> | ModuleRuntimeLoader<any> | undefined {
    const loaders = this.#getLoaders()

    if (loaders === undefined) return undefined

    if (typeof loaders === 'function') {
      return loaders
    }

    return loaders[extension]
  }

  /** Get the schema configuration for this directory. */
  getSchema() {
    return this.#schema
  }

  /** Get the file system for this directory. */
  getFileSystem() {
    if (this.#fileSystem) {
      return this.#fileSystem
    }

    this.#fileSystem = new NodeFileSystem({ tsConfigPath: this.#tsConfigPath })

    return this.#fileSystem
  }

  /** Get the `Repository` for this directory. */
  getRepository(repository?: RepositoryConfig | string | Repository) {
    if (this.#repository) {
      return this.#repository
    }

    if (repository instanceof Repository) {
      this.#repository = repository
      return this.#repository
    }

    if (typeof repository === 'string' || typeof repository === 'object') {
      this.#repository = new Repository(repository)
      return this.#repository
    }

    if (this.#repositoryOption instanceof Repository) {
      this.#repository = this.#repositoryOption
      return this.#repository
    }

    if (
      typeof this.#repositoryOption === 'string' ||
      typeof this.#repositoryOption === 'object'
    ) {
      this.#repository = new Repository(this.#repositoryOption)
      return this.#repository
    }

    throw new Error(
      `[renoun] Git repository is not configured for directory "${this.#path}". Please provide a repository or repository configuration to enable source links.`
    )
  }

  /** Get the depth of the directory starting from the root directory. */
  get depth() {
    return this.getPathnameSegments().length - 2
  }

  /**
   * Perform a shallow, filter-free read of a directory's immediate children.
   * This is used for path traversal to avoid expensive recursive inclusion checks.
   */
  async #readDirectoryShallowForTraversal(
    directory: Directory<LoaderTypes>
  ): Promise<FileSystemEntry<LoaderTypes>[]> {
    const fileSystem = directory.getFileSystem()
    const rawEntries = await fileSystem.readDirectory(directory.#path)
    const entriesMap = new Map<string, FileSystemEntry<LoaderTypes>>()

    for (const entry of rawEntries) {
      // Always include index/readme and directory‑named files during traversal.
      const entryKey =
        entry.isDirectory || true ? entry.path : removeAllExtensions(entry.path)

      if (entriesMap.has(entryKey)) {
        continue
      }

      if (entry.isDirectory) {
        const subdirectory = directory.#duplicate({ path: entry.path })
        entriesMap.set(entryKey, subdirectory)
        directory.#addPathLookup(subdirectory)
      } else if (entry.isFile) {
        const sharedOptions = {
          path: entry.path,
          directory: directory as Directory<
            LoaderTypes,
            WithDefaultTypes<LoaderTypes>,
            ModuleLoaders,
            undefined
          >,
          basePathname: directory.#basePathname,
          slugCasing: directory.#slugCasing,
        } as const
        const extension = extensionName(entry.name).slice(1)
        const loader = directory.#resolveLoaderForExtension(extension) as
          | ModuleLoader<LoaderTypes[any]>
          | undefined

        const file =
          extension === 'md'
            ? new MarkdownFile({ ...sharedOptions, loader })
            : extension === 'mdx'
              ? new MDXFile({ ...sharedOptions, loader })
              : extension === 'json'
                ? new JSONFile(sharedOptions)
                : isJavaScriptLikeExtension(extension)
                  ? new JavaScriptFile({ ...sharedOptions, loader })
                  : new File(sharedOptions)

        entriesMap.set(entryKey, file)
        directory.#addPathLookup(file)
      }
    }

    return Array.from(entriesMap.values())
  }

  /**
   * Walk `segments` starting at `directory`, returning the first entry whose
   * slugified path exactly matches the requested path segments.
   */
  async #findEntry(
    directory: Directory<LoaderTypes>,
    segments: string[],
    allExtensions?: string[]
  ): Promise<FileSystemEntry<LoaderTypes>> {
    // Fast path try direct path lookup without hydrating the directory.
    if (segments.length > 0) {
      const directoryWorkspacePath = directory.workspacePath
        .replace(/^\.\/?/, '')
        .replace(/\/$/, '')
      const targetPath =
        (directoryWorkspacePath ? directoryWorkspacePath + '/' : '') +
        segments.join('/')
      const hit = this.#pathLookup.get(targetPath)
      if (hit) {
        const [, ...remainingSegments] = segments
        // When there are no remaining segments, prefer files over directories
        // to ensure sibling files are preferred (e.g., "integrations.mdx" over "integrations/").
        if (!remainingSegments.length) {
          if (hit instanceof File) {
            if (allExtensions && !allExtensions.includes(hit.extension)) {
              // Fall through to regular resolution when extension doesn't match.
            } else {
              return hit
            }
          }
          // If it's a directory and we have no remaining segments, fall through
          // to check for a sibling file in the regular resolution logic.
        } else {
          // When there are remaining segments, directories are valid intermediate paths.
          if (hit instanceof Directory) {
            return this.#findEntry(hit, remainingSegments, allExtensions)
          }
          if (hit instanceof File) {
            if (allExtensions && !allExtensions.includes(hit.extension)) {
              // Fall through to regular resolution when extension doesn't match.
            } else {
              return hit
            }
          }
        }
      }
    }

    // Shallow traversal to populate the lookup map without expensive filtering.
    const entries = await this.#readDirectoryShallowForTraversal(directory)
    const [currentSegment, ...remainingSegments] = segments

    // If the current segment is empty, we are at the root of this directory.
    if (!currentSegment) {
      return directory
    }

    let fallback: FileSystemEntry<LoaderTypes> | undefined
    let matchingDirectory: Directory<LoaderTypes> | undefined

    // If there are no remaining segments, prefer a file match over a directory
    // with the same base name. This ensures sibling files are preferred over
    // directories when both exist (e.g., "integrations.mdx" over "integrations/").
    // Also prefer base files (without modifiers) over files with modifiers.
    if (remainingSegments.length === 0) {
      let matchingFile: File<LoaderTypes> | undefined
      let matchingFileWithModifier: File<LoaderTypes> | undefined
      for (const entry of entries) {
        if (!(entry instanceof File)) continue
        const baseSlug = createSlug(entry.baseName, this.#slugCasing)
        if (baseSlug !== currentSegment) continue
        // If extensions were specified, only consider matching files.
        if (allExtensions && !allExtensions.includes(entry.extension)) {
          continue
        }
        // Prefer files without modifiers over files with modifiers.
        if (!entry.kind) {
          matchingFile = entry
        } else if (!matchingFileWithModifier) {
          matchingFileWithModifier = entry
        }
      }
      if (matchingFile) {
        return matchingFile
      }
      if (matchingFileWithModifier) {
        return matchingFileWithModifier
      }
    }

    for (const entry of entries) {
      const baseSlug = createSlug(entry.baseName, this.#slugCasing)

      if (entry instanceof Directory && baseSlug === currentSegment) {
        if (remainingSegments.length === 0) {
          matchingDirectory = entry
          continue
        }

        return this.#findEntry(entry, remainingSegments, allExtensions)
      }

      if (!(entry instanceof File) || baseSlug !== currentSegment) {
        continue
      }

      const modifier = entry.kind
      const matchesExtension = allExtensions
        ? allExtensions.includes(entry.extension)
        : true

      // e.g. "Button/examples" → modifier must match the tail segment
      if (remainingSegments.length === 1 && modifier) {
        if (
          createSlug(modifier, this.#slugCasing) === remainingSegments[0] &&
          matchesExtension
        ) {
          return entry
        }
        continue
      }

      // plain "Button" (no modifier segment)
      if (remainingSegments.length === 0 && matchesExtension) {
        // Prefer the base file, fall back to file‑with‑modifier if nothing else
        if (!fallback || (fallback instanceof File && fallback.kind)) {
          fallback = entry
        }
      }
    }

    if (fallback) {
      return fallback
    }

    if (matchingDirectory) {
      return matchingDirectory
    }

    throw new FileNotFoundError(segments.join('/'), allExtensions, {
      directoryPath: directory.workspacePath,
      rootPath: directory.getRootPath(),
      nearestCandidates: entries.map((entry) => entry.baseName),
    })
  }

  /**
   * Get a file at the specified `path` in the file system. The `path` does not
   * need to include the order prefix or extension. Additionally, an `extension`
   * can be provided for the second argument to find the first matching file path
   * that includes the extension.
   *
   * If the file is not found, an error will be thrown. Use `FileNotFoundError`
   * to handle the error.
   */
  async getFile<
    const Path extends string,
    Extension extends ExtractFileExtension<Path> = ExtractFileExtension<Path>,
  >(
    path: Path
  ): Promise<
    Extension extends string
      ? IsJavaScriptLikeExtension<Extension> extends true
        ? JavaScriptFile<
            JavaScriptFileExtensionTypes<
              Extension,
              ResolveDirectoryTypes<LoaderTypes, Loaders, Schema>
            >,
            any,
            string,
            Extension
          >
        : Extension extends 'mdx'
          ? MDXFile<
              ResolveDirectoryTypes<LoaderTypes, Loaders, Schema>['mdx'] &
                Record<string, any>,
              any,
              string,
              Extension
            >
          : Extension extends 'md'
            ? MarkdownFile<
                ResolveDirectoryTypes<LoaderTypes, Loaders, Schema>['md'] &
                  Record<string, any>,
                any,
                string,
                Extension
              >
            : Extension extends 'json'
              ? JSONFile<
                  JSONExtensionType<
                    ResolveDirectoryTypes<LoaderTypes, Loaders, Schema>
                  > &
                    Record<string, any>,
                  any,
                  string,
                  Extension
                >
              : File<any, Path, Extension>
      : File<any>
  >

  async getFile<
    const Extension extends keyof ResolveDirectoryTypes<
      LoaderTypes,
      Loaders,
      Schema
    > &
      string,
  >(
    path: string | string[],
    extension: Extension
  ): Promise<
    IsJavaScriptLikeExtension<Extension> extends true
      ? JavaScriptFile<
          JavaScriptFileExtensionTypes<
            Extension,
            ResolveDirectoryTypes<LoaderTypes, Loaders, Schema>
          >,
          any,
          string,
          Extension
        >
      : Extension extends 'mdx'
        ? MDXFile<
            ResolveDirectoryTypes<LoaderTypes, Loaders, Schema>['mdx'] &
              Record<string, any>,
            any,
            string,
            Extension
          >
        : Extension extends 'md'
          ? MarkdownFile<
              ResolveDirectoryTypes<LoaderTypes, Loaders, Schema>['md'] &
                Record<string, any>,
              any,
              string,
              Extension
            >
          : Extension extends 'json'
            ? JSONFile<
                JSONExtensionType<
                  ResolveDirectoryTypes<LoaderTypes, Loaders, Schema>
                > &
                  Record<string, any>,
                any,
                string,
                Extension
              >
            : File<any, Extension>
  >

  async getFile<const Extension extends string | readonly string[]>(
    path: string | string[],
    extension?: Extension
  ): Promise<
    ExtensionElement<Extension> extends infer Ext extends string
      ? IsJavaScriptLikeExtension<Ext> extends true
        ? JavaScriptFile<
            JavaScriptFileExtensionTypes<
              Ext,
              ResolveDirectoryTypes<LoaderTypes, Loaders, Schema>
            >,
            any,
            string,
            Ext
          >
        : Ext extends 'mdx'
          ? MDXFile<
              ResolveDirectoryTypes<LoaderTypes, Loaders, Schema>['mdx'] &
                Record<string, any>,
              any,
              string,
              Ext
            >
          : Ext extends 'md'
            ? MarkdownFile<
                ResolveDirectoryTypes<LoaderTypes, Loaders, Schema>['md'] &
                  Record<string, any>,
                any,
                string,
                Ext
              >
            : Ext extends 'json'
              ? JSONFile<
                  JSONExtensionType<
                    ResolveDirectoryTypes<LoaderTypes, Loaders, Schema>
                  > &
                    Record<string, any>,
                  any,
                  string,
                  Ext
                >
              : File<any, Ext>
      : File<any>
  >

  async getFile(path: string | string[], extension?: string | string[]) {
    const normalizedInput = Array.isArray(path)
      ? path.map(normalizeSlashes)
      : normalizeSlashes(path)
    const rawPath = Array.isArray(normalizedInput)
      ? normalizedInput.join('/')
      : normalizedInput
    const cachedFile = this.#pathLookup.get(
      rawPath.startsWith('/') ? rawPath : `/${rawPath}`
    )

    if (
      cachedFile instanceof File &&
      (!extension ||
        (Array.isArray(extension)
          ? extension.includes(cachedFile.extension)
          : extension === cachedFile.extension))
    ) {
      return cachedFile
    }

    // normalize the incoming path
    let normalizedPath = normalizedInput
    if (typeof normalizedPath === 'string' && normalizedPath.startsWith('./')) {
      normalizedPath = normalizedPath.slice(2)
    }

    const rawSegments = Array.isArray(normalizedPath)
      ? [...normalizedPath]
      : normalizedPath.split('/').filter(Boolean)
    const lastSegment = rawSegments.at(-1)
    let parsedExtension: string | undefined

    if (lastSegment) {
      const segmentIndex = lastSegment.lastIndexOf('.')

      if (segmentIndex > 0) {
        parsedExtension = lastSegment.slice(segmentIndex + 1)
        rawSegments[rawSegments.length - 1] = lastSegment.slice(0, segmentIndex)
      }
    }

    if (extension && parsedExtension && extension.includes(parsedExtension)) {
      throw new Error(
        `[renoun] The path "${rawPath}" already includes the file extension "${parsedExtension}". The \`extension\` argument can only use a path with a different extension.`
      )
    }

    const allExtensions: string[] | undefined = Array.isArray(extension)
      ? extension
      : extension
        ? [extension]
        : parsedExtension
          ? [parsedExtension]
          : undefined
    const segments = rawSegments.map((segment) =>
      createSlug(segment, this.#slugCasing)
    )

    if (segments.length === 0) {
      throw new FileNotFoundError(rawPath, allExtensions, {
        directoryPath: this.workspacePath,
        rootPath: this.getRootPath(),
      })
    }

    let entry = await this.#findEntry(this, segments, allExtensions)

    // If we ended on a directory, try to find a representative file within it
    if (entry instanceof Directory) {
      // Bypass the directory filter when selecting a representative file directly.
      const directoryEntries = await entry
        .#duplicate({
          filter: undefined,
        })
        .getEntries({
          includeDirectoryNamedFiles: true,
          includeIndexAndReadmeFiles: true,
          includeTsConfigExcludedFiles: true,
        })

      // Find a representative file in the directory
      let sameNameNoModifier: File<LoaderTypes> | undefined
      let sameNameWithModifier: File<LoaderTypes> | undefined
      let fallback: File<LoaderTypes> | undefined
      let anyMatchingFile: File<LoaderTypes> | undefined

      for (const directoryEntry of directoryEntries) {
        if (!(directoryEntry instanceof File)) {
          continue
        }

        const baseName = directoryEntry.baseName
        const extension = directoryEntry.extension
        const hasValidExtension = allExtensions
          ? allExtensions.includes(extension)
          : true

        // Check for file that shares the directory name
        if (baseName === entry.baseName && hasValidExtension) {
          if (!directoryEntry.kind) {
            // Prefer file without modifier (e.g. Link.tsx)
            sameNameNoModifier = directoryEntry
          } else if (!sameNameWithModifier) {
            // Track modified file (e.g. Link.examples.tsx) as a secondary choice
            sameNameWithModifier = directoryEntry
          }
        }

        // Check for index/readme as fallback
        if (
          !fallback &&
          ['index', 'readme'].includes(baseName.toLowerCase()) &&
          hasValidExtension
        ) {
          fallback = directoryEntry
          // Don't break here as we might find a better match later
        }

        // Track the first file that matches the requested extension(s) as a
        // last-resort fallback if no better representative is found.
        if (!anyMatchingFile && hasValidExtension) {
          anyMatchingFile = directoryEntry
        }
      }

      if (sameNameNoModifier) {
        entry = sameNameNoModifier
      } else if (sameNameWithModifier) {
        entry = sameNameWithModifier
      } else if (fallback) {
        entry = fallback
      } else if (anyMatchingFile) {
        entry = anyMatchingFile
      } else {
        throw new FileNotFoundError(rawPath, allExtensions, {
          directoryPath: entry.workspacePath,
          rootPath: entry.getRootPath(),
          nearestCandidates: directoryEntries.map((entry) => entry.baseName),
        })
      }
    }

    if (entry instanceof File) {
      return entry as any
    }

    throw new FileNotFoundError(rawPath, allExtensions, {
      directoryPath: this.workspacePath,
      rootPath: this.getRootPath(),
    })
  }

  /** Get a directory at the specified `path`. */
  async getDirectory(path: string | string[]): Promise<Directory<LoaderTypes>> {
    const segments = Array.isArray(path)
      ? path.map(normalizeSlashes)
      : normalizeSlashes(path)
          .replace(/^\.\/?/, '')
          .split('/')
          .filter(Boolean)
    let currentDirectory = this as Directory<LoaderTypes>

    while (segments.length > 0) {
      const currentSegment = createSlug(segments.shift()!, this.#slugCasing)
      // Use shallow, filter-free traversal to avoid expensive recursion or
      // export-based inclusion checks while walking segments.
      const allEntries =
        await this.#readDirectoryShallowForTraversal(currentDirectory)
      let entry: FileSystemEntry<LoaderTypes> | undefined

      for (const currentEntry of allEntries) {
        const baseSegment = createSlug(currentEntry.baseName, this.#slugCasing)

        if (
          currentEntry instanceof Directory &&
          baseSegment === currentSegment
        ) {
          entry = currentEntry
          break
        }
      }

      if (!entry || !(entry instanceof Directory)) {
        throw new FileNotFoundError(path, undefined, {
          directoryPath: this.workspacePath,
          rootPath: this.getRootPath(),
        })
      }

      currentDirectory = entry
    }

    return currentDirectory
  }

  /**
   * Get a directory or file at the specified `path`.
   *
   * - If a directory exists at the `path` and it contains a file with the same
   *   base name as the directory (e.g. `Button/Button.tsx`), that file is returned.
   * - Otherwise, the directory itself is returned when it exists.
   * - If no directory exists, a file at the `path` is resolved.
   *
   * ```ts
   * import { Directory } from 'renoun'
   *
   * // Same‑named file inside directory
   * // components/Button/Button.tsx
   * await new Directory({ path: 'components' }).getEntry('button') // JavaScriptFile
   *
   * // Directory has only index/readme (no same‑named file)
   * // components/CodeBlock/index.tsx
   * await new Directory({ path: 'components' }).getEntry('code-block') // JavaScriptFile
   *
   * // No directory at path, only a file
   * // components/Card.tsx
   * await new Directory({ path: 'components' }).getEntry('card') // JavaScriptFile
   *
   * // Nested lookup within an existing directory
   * // src/project/server.ts
   * const project = await new Directory({ path: 'src' }).getDirectory('project')
   * await project.getEntry('server') // JavaScriptFile
   *
   * // Finally, if no file is found, the directory is returned
   * // src/project/index.tsx
   * await new Directory({ path: 'src' }).getEntry('project') // Directory
   * ```
   */
  async getEntry(
    path: string | string[]
  ): Promise<FileSystemEntry<LoaderTypes>> {
    try {
      const directory = await this.getDirectory(path)
      const directoryBaseName = directory.baseName
      let sameNamedSibling: File<LoaderTypes> | undefined

      try {
        const parentDirectory = directory.getParent()
        try {
          const sibling = await parentDirectory.getFile(directoryBaseName)
          if (
            sibling instanceof File &&
            sibling.baseName === directoryBaseName
          ) {
            sameNamedSibling = sibling as File<LoaderTypes>
          }
        } catch (error) {
          if (!(error instanceof FileNotFoundError)) {
            throw error
          }
        }
      } catch {
        // Root directory does not have a parent. Ignore.
      }

      if (sameNamedSibling) {
        return sameNamedSibling
      }

      const entries = await directory.getEntries({
        includeDirectoryNamedFiles: true,
        includeIndexAndReadmeFiles: true,
      })

      for (const entry of entries) {
        const entryBaseName = entry.baseName
        if (
          entry instanceof File &&
          (entryBaseName === directoryBaseName ||
            entryBaseName === 'index' ||
            entryBaseName === 'readme')
        ) {
          return entry
        }
      }

      return directory
    } catch (error) {
      if (error instanceof FileNotFoundError) {
        return this.getFile(path)
      }
      throw error
    }
  }

  #snapshotCache = new Map<
    number,
    DirectorySnapshot<Directory<LoaderTypes>, FileSystemEntry<LoaderTypes>>
  >()
  #pathLookup = new Map<string, FileSystemEntry<LoaderTypes>>()

  /**
   * Add an entry to the path lookup table. This avoids the need to traverse the
   * entire directory tree to find a file or directory that has already been created.
   */
  #addPathLookup(entry: FileSystemEntry<LoaderTypes>) {
    const routePath = entry.getPathname()
    this.#pathLookup.set(routePath, entry)

    // Remove leading and trailing slashes
    const normalizedPath = routePath.replace(/^\.\/?/, '').replace(/\/$/, '')
    this.#pathLookup.set(normalizedPath, entry)
    // Also index by workspace-relative filesystem path so lookups by raw path
    // (e.g. "fixtures/docs/index") can short-circuit hydration.
    const workspacePath = entry.workspacePath
    const normalizedWorkspacePath = workspacePath
      .replace(/^\.\/?/, '')
      .replace(/\/$/, '')
    this.#pathLookup.set(normalizedWorkspacePath, entry)
    // For files, also index the workspace path without extensions to match
    // extension-agnostic lookups.
    if (entry instanceof File) {
      const workspacePathWithoutExtension = removeAllExtensions(
        normalizedWorkspacePath
      )
      this.#pathLookup.set(workspacePathWithoutExtension, entry)
    }
  }

  invalidateSnapshots() {
    this.#snapshotCache.clear()
  }

  /**
   * Retrieves all entries (files and directories) within the current directory
   * that are not excluded by Git ignore rules or the closest `tsconfig` file.
   * Additionally, `index` and `readme` files are excluded by default.
   */
  async getEntries<
    const ProvidedFilter extends
      | DirectoryFilter<
          FileSystemEntry<ApplyDirectorySchema<LoaderTypes, Schema>>,
          ApplyDirectorySchema<LoaderTypes, Schema>
        >
      | undefined = Filter,
  >(options?: {
    /** Filter entries with a minimatch pattern or predicate. */
    filter?: ProvidedFilter

    /** Recursively walk every subdirectory. */
    recursive?: DirectoryEntriesRecursiveOption<
      ProvidedFilter extends undefined ? Filter : ProvidedFilter
    >

    /** Include files named the same as their immediate directory (e.g. `Button/Button.tsx`). */
    includeDirectoryNamedFiles?: boolean

    /** Include index and readme files. */
    includeIndexAndReadmeFiles?: boolean

    /** Include files that are ignored by `.gitignore`. */
    includeGitIgnoredFiles?: boolean

    /** Include files that are excluded by the configured `tsconfig.json` file's `exclude` patterns. */
    includeTsConfigExcludedFiles?: boolean

    /** Include hidden files and directories (names starting with `.`). */
    includeHiddenFiles?: boolean
  }): Promise<
    Array<
      ResolveDirectoryFilterEntries<
        ProvidedFilter extends undefined ? Filter : ProvidedFilter,
        ApplyDirectorySchema<LoaderTypes, Schema>
      >
    >
  >

  async getEntries(options?: {
    filter?: any
    recursive?: any
    includeDirectoryNamedFiles?: boolean
    includeIndexAndReadmeFiles?: boolean
    includeGitIgnoredFiles?: boolean
    includeTsConfigExcludedFiles?: boolean
    includeHiddenFiles?: boolean
  }): Promise<any> {
    const filterOverride = options?.filter
    const hasFilterOverride = filterOverride !== undefined
    const directory = hasFilterOverride
      ? this.#duplicate({ filter: filterOverride as any })
      : this
    const entriesOptions: {
      recursive?: boolean
      includeDirectoryNamedFiles?: boolean
      includeIndexAndReadmeFiles?: boolean
      includeGitIgnoredFiles?: boolean
      includeTsConfigExcludedFiles?: boolean
      includeHiddenFiles?: boolean
    } = { ...(options ?? {}) }

    delete (entriesOptions as any).filter

    if (entriesOptions.recursive && directory.#filterPattern) {
      if (!directory.#filterPattern.includes('**')) {
        const lines: string[] = [
          `[renoun] Cannot use recursive option with a shallow filter pattern.`,
          `Method: Directory#getEntries`,
          `Directory path: "${directory.#path}"`,
          `Filter pattern: "${directory.#filterPattern}"`,
          `Hint: Use a recursive pattern (e.g. "**/*.mdx") when "recursive" is enabled.`,
        ]
        if (directory.#rootPath) {
          lines.push(`Directory root: "${directory.#rootPath}"`)
        }
        throw new Error(lines.join('\n'))
      }
    }

    const normalized = directory.#normalizeEntriesOptions(entriesOptions)
    const mask = createOptionsMask(normalized)

    const cachedSnapshot = directory.#snapshotCache.get(mask)
    if (cachedSnapshot) {
      if (process.env.NODE_ENV === 'development') {
        const isStale = await directory.#isSnapshotStale(cachedSnapshot)
        if (!isStale) {
          return cachedSnapshot.materialize() as any
        }
        directory.#snapshotCache.delete(mask)
      } else {
        return cachedSnapshot.materialize() as any
      }
    }

    const snapshot = await directory.#hydrateDirectorySnapshot(
      directory,
      normalized,
      mask
    )

    return snapshot.materialize() as any
  }

  async getStructure(): Promise<Array<DirectoryStructure | FileStructure>> {
    const relativePath = this.workspacePath
    const path = this.getPathname()

    const structures: Array<DirectoryStructure | FileStructure> = [
      {
        type: 'directory',
        name: this.name,
        title: this.title,
        slug: this.slug,
        path,
        relativePath,
        depth: this.depth,
      },
    ]

    const entries = await this.getEntries({
      includeDirectoryNamedFiles: true,
      includeIndexAndReadmeFiles: true,
    })

    for (const entry of entries) {
      if (typeof (entry as any).getStructure === 'function') {
        const entryStructure = await (entry as any).getStructure()
        // Directories return arrays, files return single structures
        if (Array.isArray(entryStructure)) {
          structures.push(...entryStructure)
        } else {
          structures.push(entryStructure)
        }
      }
    }

    return structures
  }

  #normalizeEntriesOptions(options?: {
    recursive?: boolean
    includeDirectoryNamedFiles?: boolean
    includeIndexAndReadmeFiles?: boolean
    includeGitIgnoredFiles?: boolean
    includeTsConfigExcludedFiles?: boolean
    includeHiddenFiles?: boolean
  }): NormalizedDirectoryEntriesOptions {
    return {
      recursive: options?.recursive ?? false,
      includeDirectoryNamedFiles: options?.includeDirectoryNamedFiles ?? false,
      includeIndexAndReadmeFiles: options?.includeIndexAndReadmeFiles ?? false,
      includeGitIgnoredFiles: options?.includeGitIgnoredFiles ?? false,
      includeTsConfigExcludedFiles:
        options?.includeTsConfigExcludedFiles ?? false,
      includeHiddenFiles: options?.includeHiddenFiles ?? false,
    }
  }

  async #hydrateDirectorySnapshot(
    directory: Directory<LoaderTypes>,
    options: NormalizedDirectoryEntriesOptions,
    mask: number
  ): Promise<
    DirectorySnapshot<Directory<LoaderTypes>, FileSystemEntry<LoaderTypes>>
  > {
    const { snapshot } = await this.#buildSnapshot(directory, options, mask)
    return snapshot
  }

  async #isSnapshotStale(
    snapshot: DirectorySnapshot<
      Directory<LoaderTypes>,
      FileSystemEntry<LoaderTypes>
    >
  ): Promise<boolean> {
    const dependencies = snapshot.getDependencies()
    if (!dependencies || dependencies.size === 0) {
      return false
    }

    const fileSystem = this.getFileSystem()

    for (const [path, previousModified] of dependencies) {
      const currentModified = await fileSystem.getFileLastModifiedMs(path)
      if (
        currentModified === undefined ||
        currentModified !== previousModified
      ) {
        return true
      }
    }

    return false
  }

  async #buildSnapshot(
    directory: Directory<LoaderTypes>,
    options: NormalizedDirectoryEntriesOptions,
    mask: number
  ): Promise<{
    snapshot: DirectorySnapshot<
      Directory<LoaderTypes>,
      FileSystemEntry<LoaderTypes>
    >
    shouldIncludeSelf: boolean
  }> {
    const cached = directory.#snapshotCache.get(mask)
    if (cached) {
      return { snapshot: cached, shouldIncludeSelf: cached.shouldIncludeSelf }
    }

    const fileSystem = directory.getFileSystem()
    const rawEntries = await fileSystem.readDirectory(directory.#path)
    const dependencyTimestamps: Map<string, number> | undefined =
      process.env.NODE_ENV === 'development'
        ? new Map<string, number>()
        : undefined

    const fileMetadata: FileEntryMetadata<LoaderTypes>[] = []
    const finalMetadata: DirectorySnapshotMetadataEntry<LoaderTypes>[] = []
    const finalKeys = new Set<string>()
    const directoriesMap = new Map<
      Directory<LoaderTypes>,
      DirectorySnapshotDirectoryMetadata<FileSystemEntry<LoaderTypes>>
    >()

    for (const entry of rawEntries) {
      // Skip hidden files and directories (names starting with `.`) unless explicitly included
      const isHiddenFile = entry.name.startsWith('.')
      if (isHiddenFile && !options.includeHiddenFiles) {
        continue
      }

      if (dependencyTimestamps) {
        try {
          const mtime = await fileSystem.getFileLastModifiedMs(entry.path)
          if (mtime !== undefined) {
            dependencyTimestamps.set(entry.path, mtime)
          }
        } catch {
          // Ignore errors when reading timestamps; fall back to snapshot invalidation
          // via explicit cache clearing (e.g. write/delete operations).
        }
      }

      const isGitIgnored = fileSystem.isFilePathGitIgnored(entry.path)

      if (isGitIgnored && !options.includeGitIgnoredFiles) {
        continue
      }

      const isTsConfigExcluded = fileSystem.isFilePathExcludedFromTsConfig(
        entry.path,
        entry.isDirectory
      )

      if (entry.isDirectory) {
        if (isTsConfigExcluded && !options.includeTsConfigExcludedFiles) {
          continue
        }

        const key = entry.path
        if (finalKeys.has(key)) {
          continue
        }

        const subdirectory = directory.#duplicate({ path: entry.path })
        directory.#addPathLookup(subdirectory)

        const { snapshot: childSnapshot } = await this.#buildSnapshot(
          subdirectory,
          options,
          mask
        )

        const passesFilterSelf =
          directory.#simpleFilter?.recursive === true
            ? true
            : directory.#filter
              ? await directory.#passesFilter(subdirectory)
              : true

        const metadata: DirectoryEntryMetadata<LoaderTypes> = {
          type: 'directory',
          entry: subdirectory,
          includeInFinal: true,
          passesFilterSelf,
          snapshot: childSnapshot,
        }

        finalKeys.add(key)
        finalMetadata.push(metadata)

        continue
      }

      if (!entry.isFile) {
        continue
      }

      const sharedOptions = {
        path: entry.path,
        directory: directory as Directory<
          LoaderTypes,
          WithDefaultTypes<LoaderTypes>,
          ModuleLoaders,
          undefined
        >,
        basePathname: directory.#basePathname,
        slugCasing: directory.#slugCasing,
      } as const

      const extension = extensionName(entry.name).slice(1)
      const loader = directory.#resolveLoaderForExtension(extension) as
        | ModuleLoader<LoaderTypes[any]>
        | undefined

      const file =
        extension === 'md'
          ? new MarkdownFile({ ...sharedOptions, loader })
          : extension === 'mdx'
            ? new MDXFile({ ...sharedOptions, loader })
            : extension === 'json'
              ? new JSONFile(sharedOptions)
              : isJavaScriptLikeExtension(extension)
                ? new JavaScriptFile({ ...sharedOptions, loader })
                : new File(sharedOptions)

      const passesFilter = directory.#filter
        ? await directory.#passesFilter(file)
        : true

      if (!passesFilter) {
        continue
      }

      const shouldIncludeFile = await directory.#shouldIncludeFile(file)
      const isIndexOrReadme = ['index', 'readme'].some((name) =>
        entry.name.toLowerCase().startsWith(name)
      )
      const isDirectoryNamedFile =
        removeAllExtensions(entry.name) === directory.baseName

      let includeInFinal = true

      if (!options.includeIndexAndReadmeFiles && isIndexOrReadme) {
        includeInFinal = false
      }

      if (!options.includeTsConfigExcludedFiles && isTsConfigExcluded) {
        includeInFinal = false
      }

      if (
        !options.includeDirectoryNamedFiles &&
        !options.recursive &&
        isDirectoryNamedFile
      ) {
        includeInFinal = false
      }

      if (!options.includeGitIgnoredFiles && isGitIgnored) {
        includeInFinal = false
      }

      if (!shouldIncludeFile) {
        includeInFinal = false
      }

      const metadata: FileEntryMetadata<LoaderTypes> = {
        type: 'file',
        entry: file,
        includeInFinal,
        isGitIgnored,
        isIndexOrReadme,
        isTsConfigExcluded,
        isDirectoryNamedFile,
        passesFilter,
        shouldIncludeFile,
      }

      fileMetadata.push(metadata)

      if (includeInFinal) {
        const key = options.includeDirectoryNamedFiles
          ? entry.path
          : removeAllExtensions(entry.path)

        if (!finalKeys.has(key)) {
          finalKeys.add(key)
          finalMetadata.push(metadata)
          directory.#addPathLookup(file)
        }
      }
    }

    let shouldIncludeSelf = false

    for (const metadata of fileMetadata) {
      if (!metadata.isGitIgnored && metadata.shouldIncludeFile) {
        shouldIncludeSelf = true
        break
      }
    }

    if (!shouldIncludeSelf) {
      for (const metadata of finalMetadata) {
        if (
          metadata.type === 'directory' &&
          metadata.snapshot.shouldIncludeSelf
        ) {
          shouldIncludeSelf = true
          break
        }
      }
    }

    const immediateMetadata: DirectorySnapshotMetadataEntry<LoaderTypes>[] = []

    for (const metadata of finalMetadata) {
      if (metadata.type === 'file') {
        if (metadata.shouldIncludeFile && metadata.includeInFinal) {
          immediateMetadata.push(metadata)
        }
      } else if (metadata.snapshot.shouldIncludeSelf) {
        immediateMetadata.push(metadata)
      }
    }

    const immediateEntries = immediateMetadata.map((meta) => meta.entry)

    if (this.#sort && immediateEntries.length > 1) {
      await sortEntries(immediateEntries, this.#sort)
      const order = new Map(
        immediateEntries.map((entry, index) => [entry, index] as const)
      )
      immediateMetadata.sort(
        (a, b) => order.get(a.entry)! - order.get(b.entry)!
      )
    }

    const entriesResult: FileSystemEntry<LoaderTypes>[] = []

    for (const metadata of immediateMetadata) {
      if (metadata.type === 'file') {
        entriesResult.push(metadata.entry)
        continue
      }

      const directoryEntry = metadata.entry
      const childSnapshot = metadata.snapshot
      const childrenEntries = options.recursive
        ? childSnapshot.materialize()
        : []
      const hasVisibleDescendant = options.recursive
        ? childrenEntries.length > 0
        : childSnapshot.hasVisibleDescendant

      if (
        metadata.passesFilterSelf &&
        (!options.recursive || hasVisibleDescendant)
      ) {
        entriesResult.push(directoryEntry)
      }

      directoriesMap.set(directoryEntry, {
        hasVisibleDescendant,
        materializedEntries: childrenEntries,
      })

      if (options.recursive) {
        const directoryBaseName = directoryEntry.baseName
        for (const childEntry of childrenEntries) {
          const isDirectoryNamedFile =
            childEntry instanceof File &&
            childEntry.getParent() === directoryEntry &&
            childEntry.baseName === directoryBaseName &&
            !options.includeDirectoryNamedFiles

          if (!isDirectoryNamedFile) {
            entriesResult.push(childEntry)
          }
        }
      }
    }

    const snapshot = createDirectorySnapshot<
      Directory<LoaderTypes>,
      FileSystemEntry<LoaderTypes>
    >({
      entries: entriesResult,
      directories: directoriesMap,
      shouldIncludeSelf,
      hasVisibleDescendant: entriesResult.length > 0,
      dependencies: dependencyTimestamps,
    })

    directory.#snapshotCache.set(mask, snapshot)

    return { snapshot, shouldIncludeSelf }
  }

  /** Get the root directory path. */
  getRootPath() {
    return this.#rootPath ?? this.#path
  }

  /** Get the parent directory containing this directory. */
  getParent() {
    if (this.#directory) {
      return this.#directory
    }

    throw new Error(
      `[renoun] The root directory does not have a parent directory.`
    )
  }

  /** Get the previous and next sibling entries (files or directories) of the parent directory. */
  async getSiblings<
    GroupTypes extends Record<string, any> = LoaderTypes,
  >(options?: {
    collection?: Collection<GroupTypes, FileSystemEntry<any>[]>
  }): Promise<
    [
      FileSystemEntry<LoaderTypes> | undefined,
      FileSystemEntry<LoaderTypes> | undefined,
    ]
  > {
    let entries: FileSystemEntry<LoaderTypes>[]

    if (options?.collection) {
      entries = await options.collection.getEntries({ recursive: true })
    } else if (this.#directory) {
      entries = await this.#directory.getEntries()
    } else {
      return [undefined, undefined]
    }

    const path = this.getPathname()
    const index = entries.findIndex(
      (entryToCompare) => entryToCompare.getPathname() === path
    )
    const previous = index > 0 ? entries[index - 1] : undefined
    const next = index < entries.length - 1 ? entries[index + 1] : undefined

    return [previous, next]
  }

  /** Get the slug of this directory. */
  get slug() {
    return createSlug(this.baseName, this.#slugCasing)
  }

  /** The directory name. */
  get name() {
    return this.baseName
  }

  /** The base name of this directory. */
  get baseName() {
    return removeOrderPrefixes(baseName(this.#path))
  }

  /** The directory name formatted as a title. */
  get title() {
    return formatNameAsTitle(this.name)
  }

  /** Get a URL-friendly path to this directory. */
  getPathname(options?: { includeBasePathname?: boolean }) {
    const includeBasePathname = options?.includeBasePathname ?? true
    const fileSystem = this.getFileSystem()
    const path = fileSystem.getPathname(this.#path, {
      basePath:
        includeBasePathname && this.#basePathname !== null
          ? this.#basePathname
          : undefined,
      rootPath: this.getRootPath(),
    })

    if (this.#slugCasing === 'none') {
      return path
    }

    const segments = normalizeSlashes(path).split('/')

    for (let index = 0; index < segments.length; index++) {
      segments[index] = createSlug(segments[index], this.#slugCasing)
    }

    return segments.join('/')
  }

  /** Get the route path segments to this directory. */
  getPathnameSegments(options?: { includeBasePathname?: boolean }) {
    return this.getPathname(options).split('/').filter(Boolean)
  }

  /** The relative path of this directory to the root directory. */
  get relativePath() {
    const rootPath = this.getRootPath()
    return rootPath ? relativePath(rootPath, this.#path) : this.#path
  }

  /** The relative path of the directory to the workspace. */
  get workspacePath() {
    return this.getFileSystem().getRelativePathToWorkspace(this.#path)
  }

  /** The absolute path of this directory. */
  get absolutePath() {
    return this.getFileSystem().getAbsolutePath(this.#path)
  }

  /** Get a URL to the directory for the configured git repository. */
  #getRepositoryUrl(
    repository?: RepositoryConfig | string | Repository,
    options?: Omit<GetDirectoryUrlOptions, 'path'>
  ) {
    return this.getRepository(repository).getDirectoryUrl({
      path: this.workspacePath,
      ...options,
    })
  }

  /** Get the URL to the directory history for the configured git repository. */
  getHistoryUrl(
    options?: Pick<GetFileUrlOptions, 'ref'> & {
      repository?: RepositoryConfig | string | Repository
    }
  ) {
    return this.#getRepositoryUrl(options?.repository, {
      type: 'history',
      ref: options?.ref,
    })
  }

  /** Get the URL to the directory source for the configured git repository. */
  getSourceUrl(
    options?: Pick<GetFileUrlOptions, 'ref'> & {
      repository?: RepositoryConfig | string | Repository
    }
  ) {
    return this.#getRepositoryUrl(options?.repository, {
      type: 'source',
      ref: options?.ref,
    })
  }

  /** Get a release URL for the configured git repository. */
  getReleaseUrl(options?: SourceReleaseUrlOptions) {
    const { repository: repositoryOption, ...rest } = options ?? {}
    return this.getRepository(repositoryOption).getReleaseUrl(rest)
  }

  /** Retrieve metadata about a release for the configured git repository. */
  getRelease(options?: SourceReleaseOptions): Promise<Release> {
    const { repository: repositoryOption, ...rest } = options ?? {}
    return this.getRepository(repositoryOption).getRelease(rest)
  }

  /** Get the URI to the directory source code for the configured editor. */
  getEditorUri(options?: Pick<GetEditorUriOptions, 'editor'>) {
    return getEditorUri({
      path: this.absolutePath,
      editor: options?.editor,
    })
  }

  /** Get the first local git commit date of this directory. */
  async getFirstCommitDate() {
    const fileSystem = this.getFileSystem()
    const gitMetadata = isGitMetadataProvider(fileSystem)
      ? await fileSystem.getGitFileMetadata(this.#path)
      : await getLocalGitFileMetadata(this.#path)
    return gitMetadata.firstCommitDate
  }

  /** Get the last local git commit date of this directory. */
  async getLastCommitDate() {
    const fileSystem = this.getFileSystem()
    const gitMetadata = isGitMetadataProvider(fileSystem)
      ? await fileSystem.getGitFileMetadata(this.#path)
      : await getLocalGitFileMetadata(this.#path)
    return gitMetadata.lastCommitDate
  }

  /** Get the local git authors of this directory. */
  async getAuthors() {
    const fileSystem = this.getFileSystem()
    const gitMetadata = isGitMetadataProvider(fileSystem)
      ? await fileSystem.getGitFileMetadata(this.#path)
      : await getLocalGitFileMetadata(this.#path)
    return gitMetadata.authors
  }

  /** Checks if this directory contains the provided entry. */
  hasEntry(
    entry: FileSystemEntry<any> | undefined
  ): entry is FileSystemEntry<LoaderTypes> {
    if (entry === undefined) {
      return false
    }

    try {
      let directory = entry.getParent()

      while (directory) {
        if (directory === this) {
          return true
        }
        directory = directory.getParent()
      }
    } catch {
      return false
    }

    return false
  }

  /** Checks if this directory contains the provided file. */
  hasFile<
    ExtensionType extends keyof LoaderTypes | string,
    const Extension extends ExtensionType | Extension[],
  >(
    entry: FileSystemEntry<any> | undefined,
    extension?: Extension | Extension[]
  ): entry is FileWithExtension<LoaderTypes, Extension> {
    const extensions = Array.isArray(extension) ? extension : [extension]

    if (entry instanceof File && this.hasEntry(entry)) {
      if (extension) {
        for (const fileExtension of extensions) {
          if (entry.extension === fileExtension) {
            return true
          }
        }
      } else {
        return true
      }
    }

    return false
  }
}

/** Converts a union type to an intersection type. */
type UnionToIntersection<Union> = (
  Union extends any ? (distributedUnion: Union) => void : never
) extends (mergedIntersection: infer Intersection) => void
  ? Intersection & Union
  : never

/** Helper type to extract loader types from entries. */
type LoadersFromEntries<Entries extends FileSystemEntry<any>[]> =
  UnionToIntersection<
    Entries[number] extends Directory<any, infer LoaderTypes, any, any>
      ? {
          [Extension in keyof LoaderTypes & string]: ModuleRuntimeLoader<
            LoaderTypes[Extension]
          >
        }
      : {}
  >

/** Options for a `Collection`. */
export interface CollectionOptions<Entries extends FileSystemEntry<any>[]> {
  entries: Entries
}

/** A group of file system entries. */
export class Collection<
  Types extends InferModuleLoadersTypes<Loaders>,
  const Entries extends FileSystemEntry<any>[] = FileSystemEntry<any>[],
  const Loaders extends ModuleLoaders = LoadersFromEntries<Entries>,
> {
  #entries: Entries

  constructor(options: CollectionOptions<Entries>) {
    this.#entries = options.entries
  }

  /** Get all entries in the group. */
  async getEntries(options?: {
    /** Include all entries in the group recursively. */
    recursive?: boolean

    /** Include index and readme files in the group. */
    includeIndexAndReadmeFiles?: boolean
  }): Promise<Entries> {
    const allEntries: FileSystemEntry<any>[] = []

    async function findEntries(entries: FileSystemEntry<any>[]) {
      for (const entry of entries) {
        const lowerCaseBaseName = entry.baseName.toLowerCase()
        const shouldSkipIndexOrReadme = options?.includeIndexAndReadmeFiles
          ? false
          : ['index', 'readme'].some((name) =>
              lowerCaseBaseName.startsWith(name)
            )

        if (shouldSkipIndexOrReadme) {
          continue
        }

        allEntries.push(entry)

        if (options?.recursive && entry instanceof Directory) {
          const childOptions =
            entry.getFilterPatternKind() === 'recursive'
              ? options
              : ({ ...options, recursive: undefined } as typeof options)
          const nestedEntries = await entry.getEntries(childOptions)
          const startIndex = allEntries.length
          const nestedLength = nestedEntries.length
          allEntries.length = startIndex + nestedLength
          for (let nestedIndex = 0; nestedIndex < nestedLength; ++nestedIndex) {
            allEntries[startIndex + nestedIndex] = nestedEntries[nestedIndex]
          }
        }
      }
    }

    await findEntries(this.#entries)

    return allEntries as Entries
  }

  /** Get an entry in the group by its path. */
  async getEntry(
    /** The path to the entry excluding leading numbers. */
    path: string | string[]
  ): Promise<FileSystemEntry<Types>> {
    const normalizedPath = Array.isArray(path)
      ? path.map(normalizeSlashes)
      : normalizeSlashes(path).split('/').filter(Boolean)
    const rootPath = normalizedPath.at(0)

    for (const entry of this.#entries) {
      const baseName = entry.baseName
      const isRootDirectory = baseName === '.'

      if (isRootDirectory || baseName === rootPath) {
        if (entry instanceof Directory) {
          const directoryEntry = await entry
            .getEntry(
              isRootDirectory ? normalizedPath : normalizedPath.slice(1)
            )
            .catch((error) => {
              if (error instanceof FileNotFoundError) {
                return undefined
              }
              throw error
            })

          if (directoryEntry) {
            return directoryEntry
          }
        } else if (entry instanceof File) {
          if (baseName === rootPath) {
            return entry
          }
        }
      }
    }

    throw new FileNotFoundError(path)
  }

  /** Get a file at the specified path and optional extension(s). */
  async getFile<
    Path extends string | string[],
    const Extension extends string | undefined = undefined,
  >(
    /**
     * The path to the entry excluding leading numbers. The final segment may
     * optionally include the file extension e.g. `"Button.mdx"`.
     */
    path: Path,

    /** The extension or extensions to match. */
    extension?: Extension | Extension[]
  ): Promise<
    Extension extends string
      ? IsJavaScriptLikeExtension<Extension> extends true
        ? JavaScriptFile<Types[Extension]>
        : Extension extends 'mdx'
          ? MDXFile<Types['mdx']>
          : Extension extends 'md'
            ? MarkdownFile<Types['md']>
            : File<Types>
      : Path extends string
        ? ExtractFileExtension<Path> extends infer PathExtension extends string
          ? IsJavaScriptLikeExtension<PathExtension> extends true
            ? JavaScriptFile<Types[PathExtension]>
            : PathExtension extends 'mdx'
              ? MDXFile<Types['mdx']>
              : PathExtension extends 'md'
                ? MarkdownFile<Types['md']>
                : File<Types>
          : File<Types>
        : File<Types>
  > {
    const normalizedExtension: string | string[] | undefined = Array.isArray(
      extension
    )
      ? (extension.filter((e) => typeof e === 'string') as unknown as string[])
      : extension

    const normalizedPath = Array.isArray(path)
      ? path.map(normalizeSlashes)
      : normalizeSlashes(path).split('/').filter(Boolean)
    const rootPath = normalizedPath.at(0)
    const rootBaseName =
      typeof rootPath === 'string' ? removeAllExtensions(rootPath) : rootPath

    for (const entry of this.#entries) {
      const baseName = entry.baseName
      const isRootDirectory = baseName === '.'

      if (isRootDirectory || baseName === rootBaseName) {
        if (entry instanceof Directory) {
          const directoryFile = await entry
            .getFile(
              isRootDirectory ? normalizedPath : normalizedPath.slice(1),
              normalizedExtension
            )
            .catch((error) => {
              if (error instanceof FileNotFoundError) {
                return undefined
              }
              throw error
            })

          if (directoryFile) {
            return directoryFile as any
          }
        } else if (entry instanceof File) {
          if (extension) {
            const fileExtensions = Array.isArray(extension)
              ? extension
              : [extension]

            if (fileExtensions.includes(entry.extension as Extension)) {
              return entry as any
            }
          }
        }
      }
    }

    throw new FileNotFoundError(path, extension)
  }

  /** Get a directory at the specified path. */
  async getDirectory(
    /** The path to the entry excluding leading numbers. */
    path: string | string[]
  ): Promise<Directory<Types>> {
    const normalizedPath = Array.isArray(path)
      ? path.map(normalizeSlashes)
      : normalizeSlashes(path).split('/').filter(Boolean)
    const rootPath = normalizedPath.at(0)

    for (const entry of this.#entries) {
      const baseName = entry.baseName
      const isRootDirectory = baseName === '.'

      if (isRootDirectory || baseName === rootPath) {
        if (entry instanceof Directory) {
          const directory = await entry.getDirectory(
            isRootDirectory ? normalizedPath : normalizedPath.slice(1)
          )

          if (directory) {
            return directory
          }
        }
      }
    }

    throw new FileNotFoundError(path)
  }
}

/** Determines if a `FileSystemEntry` is a `Directory`. */
export function isDirectory<Types extends Record<string, any>>(
  entry: FileSystemEntry<Types> | Collection<Types> | undefined
): entry is Directory<Types> {
  return entry instanceof Directory
}

type JSONExtensionType<Types extends Record<string, any>> =
  'json' extends keyof Types ? Types['json'] : JSONObject

/** Determines the type of a `FileSystemEntry` based on its extension. */
export type FileWithExtension<
  Types extends Record<string, any>,
  Extension = LoadersToExtensions<Types>,
> = Extension extends string
  ? IsJavaScriptLikeExtension<Extension> extends true
    ? JavaScriptFile<Types[Extension], Types, any, Extension>
    : Extension extends 'mdx'
      ? MDXFile<Types['mdx'], Types, any, Extension>
      : Extension extends 'md'
        ? MarkdownFile<Types['md'], Types, any, Extension>
        : Extension extends 'json'
          ? JSONFile<JSONExtensionType<Types>, Types, any, Extension>
          : File<Types>
  : Extension extends string[]
    ? HasJavaScriptLikeExtensions<Extension> extends true
      ? JavaScriptFile<Types[Extension[number]], Types, any, Extension[number]>
      : Extension[number] extends 'mdx'
        ? MDXFile<Types['mdx'], Types, any, Extension[number]>
        : Extension[number] extends 'md'
          ? MarkdownFile<Types['md'], Types, any, Extension[number]>
          : Extension[number] extends 'json'
            ? JSONFile<JSONExtensionType<Types>, Types, any, Extension[number]>
            : File<Types>
    : File<Types>

type StringUnion<Type> = Extract<Type, string> | (string & {})

/** Resolves valid extension patterns from an object of loaders. */
export type LoadersToExtensions<
  DirectoryLoaders extends ModuleLoaders,
  ExtensionUnion = StringUnion<keyof DirectoryLoaders>,
> = ExtensionUnion | ExtensionUnion[]

/**
 * Determines if a `FileSystemEntry` is a `File` and optionally narrows the
 * result based on the provided extensions.
 */
export function isFile<
  Types extends Record<string, any>,
  const Extension extends LoadersToExtensions<Types>,
>(
  entry: FileSystemEntry<Types> | undefined,
  extension?: Extension
): entry is FileWithExtension<Types, Extension> {
  if (entry instanceof File) {
    const fileExtension = entry.extension

    if (extension instanceof Array) {
      for (const possibleExtension of extension) {
        if (fileExtension === possibleExtension) {
          return true
        }
      }
      return false
    } else if (extension) {
      return fileExtension === extension
    }

    return true
  }

  return false
}

/** Determines if a `FileSystemEntry` is a `JavaScriptFile`. */
export function isJavaScriptFile<
  FileTypes extends Record<string, any>,
  DirectoryTypes extends Record<string, any> = Record<string, any>,
>(
  entry: FileSystemEntry<DirectoryTypes> | undefined
): entry is JavaScriptFile<FileTypes, DirectoryTypes> {
  return entry instanceof JavaScriptFile
}

/** Determines if a `FileSystemEntry` is a `MarkdownFile`. */
export function isMarkdownFile<
  FileTypes extends Record<string, any>,
  DirectoryTypes extends Record<string, any> = Record<string, any>,
>(
  entry: FileSystemEntry<DirectoryTypes> | undefined
): entry is MarkdownFile<FileTypes, DirectoryTypes> {
  return entry instanceof MarkdownFile
}

/** Determines if a `FileSystemEntry` is a `JSONFile`. */
export function isJSONFile<
  FileTypes extends Record<string, any>,
  DirectoryTypes extends Record<string, any> = Record<string, any>,
>(
  entry: FileSystemEntry<DirectoryTypes> | undefined
): entry is JSONFile<FileTypes, DirectoryTypes> {
  return entry instanceof JSONFile
}

/** Determines if a `FileSystemEntry` is an `MDXFile`. */
export function isMDXFile<
  FileTypes extends Record<string, any>,
  DirectoryTypes extends Record<string, any> = Record<string, any>,
>(
  entry: FileSystemEntry<DirectoryTypes> | undefined
): entry is MDXFile<FileTypes, DirectoryTypes> {
  return entry instanceof MDXFile
}

/**
 * Attempts to resolve a file from a `FileSystemEntry`, preferring `index` and
 * `readme` for directories. The result can be optionally narrowed by extension.
 */
export async function resolveFileFromEntry<
  Types extends Record<string, any>,
  const Extension extends keyof Types & string = string,
>(
  entry: FileSystemEntry<Types>,
  extension?: Extension | readonly Extension[]
): Promise<FileWithExtension<Types, Extension> | undefined> {
  if (isDirectory(entry)) {
    try {
      return (await entry.getFile('index', extension as any)) as any
    } catch (error) {
      if (error instanceof FileNotFoundError || error instanceof Error) {
        try {
          return (await entry.getFile('readme', extension as any)) as any
        } catch {
          return undefined
        }
      }
      throw error
    }
  }

  return isFile(entry, extension as any) ? (entry as any) : undefined
}

type ComparableValue = string | number | bigint | boolean | Date

type IsPlainObject<Type> = Type extends object
  ? Type extends (...args: any) => any
    ? false
    : Type extends readonly any[]
      ? false
      : true
  : false

type PreviousDepth = [never, 0, 1]

type NestedPropertyPath<
  Type,
  Prefix extends string = '',
  Depth extends number = 4,
> = [Depth] extends [never]
  ? never
  : {
      [Key in Extract<keyof Type, string>]: Type[Key] extends ComparableValue
        ? `${Prefix}${Key}`
        : IsPlainObject<Type[Key]> extends true
          ? NestedPropertyPath<
              Type[Key],
              `${Prefix}${Key}.`,
              PreviousDepth[Depth]
            >
          : never
    }[Extract<keyof Type, string>]

type ExtensionPropertyPaths<ExtensionTypes> =
  IsAny<ExtensionTypes> extends true
    ? never
    : {
        [Extension in keyof ExtensionTypes & string]: NestedPropertyPath<
          ExtensionTypes[Extension]
        >
      }[keyof ExtensionTypes & string]

type BuiltinProperty = 'name' | 'directory'

type ValidSortKey<ExtensionTypes> =
  LoadersWithRuntimeKeys<ExtensionTypes> extends never
    ? BuiltinProperty
    : [ExtensionPropertyPaths<ExtensionTypes>] extends [never]
      ? BuiltinProperty
      : string extends ExtensionPropertyPaths<ExtensionTypes>
        ? BuiltinProperty
        : BuiltinProperty | ExtensionPropertyPaths<ExtensionTypes>

type Awaitable<Type> = Promise<Type> | Type

type SortKeyExtractor<Entry extends FileSystemEntry<any>> = (
  entry: Entry
) => Awaitable<ComparableValue>

type SortDescriptorObject<
  ExtensionTypes extends Record<string, any>,
  Entry extends FileSystemEntry<ExtensionTypes>,
  Key extends ValidSortKey<ExtensionTypes> | SortKeyExtractor<Entry> =
    | ValidSortKey<ExtensionTypes>
    | SortKeyExtractor<Entry>,
> = {
  readonly key: Key
  readonly compare?: (
    a: ExtractComparable<Key>,
    b: ExtractComparable<Key>
  ) => number
  readonly direction?: 'ascending' | 'descending'
}

type EntryTypes<E> = E extends FileSystemEntry<infer T> ? T : never

export type SortDescriptor<Entry extends FileSystemEntry<any>> =
  | ValidSortKey<EntryTypes<Entry>>
  | SortKeyExtractor<Entry>
  | SortDescriptorObject<EntryTypes<Entry>, Entry>

function keyName(entry: FileSystemEntry<any>) {
  return entry.baseName.toLowerCase()
}

/** Builds a key extractor for an `export.x.y` path. */
function exportKeyFactory(pathSegments: string[]) {
  const [exportName, ...objectPath] = pathSegments

  return async (entry: FileSystemEntry) => {
    const file = await resolveFileFromEntry(entry)
    let value: any = null

    if (file === undefined) {
      return null
    }

    if (isJavaScriptFile(file)) {
      try {
        const namedExport = await file.getNamedExport(exportName)
        value = await namedExport.getStaticValue()
      } catch {
        value = await file.getExportValue(exportName)
      }
    } else if (isMDXFile(file)) {
      value = await file.getExportValue(exportName)
    }

    if (value === null) {
      return null
    }
    for (const segment of objectPath) {
      value = value[segment]
    }
    return value
  }
}

/** Compares two primitives. */
function primitiveComparator(a: any, b: any): number {
  if (a === null || b === null) {
    if (a === null && b === null) {
      return 0
    }
    return a === null ? -1 : 1
  }
  if (a < b) {
    return -1
  }
  if (a > b) {
    return 1
  }
  return 0
}

/** Compiles a set of sort descriptors into a sort function. */
export async function sortEntries<ExtensionTypes extends Record<string, any>>(
  entries: FileSystemEntry<ExtensionTypes>[],
  descriptor: SortDescriptor<any>
) {
  let key: string | ((entry: any) => any) | ((entry: any) => Promise<any>)
  let direction: 'ascending' | 'descending' = 'ascending'
  let directionProvided = false

  if (typeof descriptor === 'string') {
    key = descriptor
  } else if (typeof descriptor === 'function') {
    key = descriptor
  } else if (
    typeof descriptor === 'object' &&
    descriptor !== null &&
    'key' in descriptor
  ) {
    key = descriptor.key
    if (descriptor.direction) {
      direction = descriptor.direction
      directionProvided = true
    }
  } else {
    throw new Error(`[renoun] Invalid sort descriptor: ${descriptor}`)
  }

  const cache = new WeakMap()
  let keyExtractor: ((entry: any) => any) | ((entry: any) => Promise<any>)

  if (typeof key === 'function') {
    keyExtractor = key
  } else if (key === 'name') {
    keyExtractor = keyName
  } else if (key === 'directory') {
    keyExtractor = isDirectory
  } else {
    keyExtractor = exportKeyFactory(key.split('.'))
  }

  const keyResolvers: Promise<void>[] = []

  for (const entry of entries) {
    if (!cache.has(entry)) {
      keyResolvers.push(
        Promise.resolve(keyExtractor(entry)).then((key) => {
          cache.set(entry, key)

          // default to descending (newest first) when a Date is detected
          if (!directionProvided && key instanceof Date) {
            direction = 'descending'
          }
        })
      )
    }
  }

  await Promise.all(keyResolvers)

  const sign = direction === 'descending' ? -1 : 1

  entries.sort((a, b) => {
    return sign * primitiveComparator(cache.get(a), cache.get(b))
  })
}

type ExtractComparable<Key> = Key extends (
  ...args: any
) => Awaitable<infer Return>
  ? Awaited<Return> extends ComparableValue
    ? Awaited<Return>
    : ComparableValue
  : ComparableValue

export function createSort<
  Entry extends FileSystemEntry<any>,
  Key extends SortKeyExtractor<Entry> = SortKeyExtractor<Entry>,
>(
  key: Key,
  compare?: (a: ExtractComparable<Key>, b: ExtractComparable<Key>) => number
): SortDescriptorObject<any, Entry, Key> {
  return { key, compare }
}

/** Parses a simple extension glob pattern into a recursive flag and a list of extensions. */
function parseSimpleGlobPattern(
  pattern: string
): { recursive: boolean; extensions: string[] } | null {
  const trimmedPattern = pattern.trim()

  // *.tsx or **/*.tsx
  let matches = trimmedPattern.match(
    /^(\*\*\/)?\*\.(?<extensions>[A-Za-z0-9]+)$/
  )
  if (matches?.groups?.['extensions']) {
    return {
      recursive: Boolean(matches[1]),
      extensions: [matches.groups['extensions'].toLowerCase()],
    }
  }

  // *.{a,b,c} or **/*.{a,b,c}
  matches = trimmedPattern.match(
    /^(\*\*\/)?\*\.{(?<extensions>[A-Za-z0-9,\s]+)}$/
  )
  if (matches?.groups?.['extensions']) {
    const extensions = matches.groups['extensions']
      .split(',')
      .map((extension) => extension.trim().toLowerCase())
      .filter(Boolean)
    if (extensions.length) {
      return {
        recursive: Boolean(matches[1]),
        extensions: extensions,
      }
    }
  }

  return null
}

export interface PackageExportOptions<
  Types extends InferDirectoryLoaderTypes<Loaders>,
  LoaderTypes extends WithDefaultTypes<Types>,
  Loaders extends DirectoryLoader,
> extends Omit<
  DirectoryOptions<Types, LoaderTypes, Loaders, undefined>,
  'path' | 'fileSystem'
> {
  path?: PathLike
}

export interface PackageOptions<
  Types extends InferDirectoryLoaderTypes<Loaders>,
  LoaderTypes extends WithDefaultTypes<Types>,
  Loaders extends DirectoryLoader,
  ExportLoaders extends PackageExportLoaderMap = {},
> {
  name?: string
  path?: PathLike
  directory?: PathLike | Directory<any, any, any>
  sourcePath?: PathLike | null
  fileSystem?: FileSystem
  exports?: Record<string, PackageExportOptions<Types, LoaderTypes, Loaders>>
  repository?: RepositoryConfig | string | Repository
  /**
   * Optional runtime loaders for individual package exports or a resolver that
   * will be invoked with the export path (e.g. "remark/add-sections").
   */
  loader?: ExportLoaders | PackageExportLoader<ModuleExports<any>>
}

interface PackageJson {
  name?: string
  exports?: string | Record<string, unknown> | null
  imports?: Record<string, unknown> | null
  workspaces?: string[] | { packages?: string[] }
  version?: string
  description?: string
}

export type PackageEntryTargetNode =
  | PackageEntryPathTarget
  | PackageEntrySpecifierTarget
  | PackageEntryConditionTarget
  | PackageEntryArrayTarget
  | PackageEntryNullTarget
  | PackageEntryUnknownTarget

export interface PackageEntryPathTarget {
  kind: 'path'
  relativePath: string
  absolutePath: string
  isPattern: boolean
}

export interface PackageEntrySpecifierTarget {
  kind: 'specifier'
  specifier: string
}

export interface PackageEntryConditionTarget {
  kind: 'conditions'
  entries: { condition: string; target: PackageEntryTargetNode }[]
}

export interface PackageEntryArrayTarget {
  kind: 'array'
  targets: PackageEntryTargetNode[]
}

export interface PackageEntryNullTarget {
  kind: 'null'
}

export interface PackageEntryUnknownTarget {
  kind: 'unknown'
  value: unknown
}

type PackageEntryType = 'exports' | 'imports'

export interface PackageEntryAnalysisBase {
  key: string
  type: PackageEntryType
  source: 'manifest' | 'override'
  isPattern: boolean
  manifestTarget?: PackageEntryTargetNode
}

export interface PackageExportAnalysis extends PackageEntryAnalysisBase {
  type: 'exports'
  derivedAbsolutePath: string
  derivedRelativePath: string
}

export interface PackageImportAnalysis extends PackageEntryAnalysisBase {
  type: 'imports'
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export interface PackageExportDirectory<
  Types extends InferDirectoryLoaderTypes<Loaders>,
  LoaderTypes extends WithDefaultTypes<Types> = WithDefaultTypes<Types>,
  Loaders extends DirectoryLoader = DirectoryLoader,
> extends Directory<Types, LoaderTypes, Loaders, undefined> {
  getExportPath(): string
  /** @internal */
  getAnalysis(): PackageExportAnalysis | undefined
}

function isDirectoryInstance(
  value: unknown
): value is Directory<any, any, any> {
  return value instanceof Directory
}

export class PackageExportDirectory<
  Types extends InferDirectoryLoaderTypes<Loaders>,
  LoaderTypes extends WithDefaultTypes<Types> = WithDefaultTypes<Types>,
  Loaders extends DirectoryLoader = DirectoryLoader,
> extends Directory<Types, LoaderTypes, Loaders, undefined> {
  #exportPath: string
  #analysis?: PackageExportAnalysis

  constructor(
    exportPath: string,
    options: DirectoryOptions<Types, LoaderTypes, Loaders, undefined>,
    analysis?: PackageExportAnalysis
  ) {
    super(options)
    this.#exportPath = exportPath
    this.#analysis = analysis
  }

  getExportPath() {
    return this.#exportPath
  }

  /** @internal */
  getAnalysis() {
    return this.#analysis
  }
}

interface PackageManifestEntry {
  key: string
  type: PackageEntryType
  isPattern: boolean
  target: PackageEntryTargetNode
}

function createManifestEntryMap(
  field: PackageJson['exports'] | PackageJson['imports'],
  type: PackageEntryType,
  packagePath: string,
  fileSystem: FileSystem
) {
  const entries = new Map<string, PackageManifestEntry>()

  if (!field) {
    return entries
  }

  if (type === 'exports' && typeof field === 'string') {
    entries.set('.', {
      key: '.',
      type,
      isPattern: false,
      target: analyzePackageTarget(field, type, packagePath, fileSystem),
    })
    return entries
  }

  if (!isPlainObject(field)) {
    return entries
  }

  for (const [key, value] of Object.entries(field)) {
    if (type === 'exports' && !isValidExportKey(key)) {
      continue
    }

    if (type === 'imports' && !isValidImportKey(key)) {
      continue
    }

    entries.set(key, {
      key,
      type,
      isPattern: key.includes('*'),
      target: analyzePackageTarget(value, type, packagePath, fileSystem),
    })
  }

  return entries
}

function isValidExportKey(key: string) {
  return key === '.' || key === './' || key.startsWith('./')
}

function isValidImportKey(key: string) {
  return key.startsWith('#')
}

function analyzePackageTarget(
  target: unknown,
  type: PackageEntryType,
  packagePath: string,
  fileSystem: FileSystem
): PackageEntryTargetNode {
  if (target === null) {
    return { kind: 'null' }
  }

  if (typeof target === 'string') {
    return analyzePackageTargetString(target, packagePath, fileSystem)
  }

  if (Array.isArray(target)) {
    return {
      kind: 'array',
      targets: target.map((entry) =>
        analyzePackageTarget(entry, type, packagePath, fileSystem)
      ),
    }
  }

  if (isPlainObject(target)) {
    return {
      kind: 'conditions',
      entries: Object.entries(target).map(([condition, value]) => ({
        condition,
        target: analyzePackageTarget(value, type, packagePath, fileSystem),
      })),
    }
  }

  return { kind: 'unknown', value: target }
}

function analyzePackageTargetString(
  target: string,
  packagePath: string,
  fileSystem: FileSystem
): PackageEntryPathTarget | PackageEntrySpecifierTarget {
  if (target.startsWith('./') || target.startsWith('../')) {
    const normalizedTarget = normalizeSlashes(target.replace(/^\.\/+/, ''))
    const absolutePath = normalizedTarget
      ? joinPaths(packagePath, normalizedTarget)
      : packagePath
    const resolvedAbsolutePath = fileSystem.getAbsolutePath(absolutePath)

    return {
      kind: 'path',
      relativePath: target,
      absolutePath: resolvedAbsolutePath,
      isPattern: target.includes('*'),
    } satisfies PackageEntryPathTarget
  }

  return {
    kind: 'specifier',
    specifier: target,
  } satisfies PackageEntrySpecifierTarget
}

function normalizePackagePath(path: PathLike) {
  const resolved = resolveSchemePath(path)

  if (resolved.startsWith('/')) {
    const workspaceRoot = normalizeSlashes(getRootDirectory())
    const absoluteResolved = normalizeSlashes(resolved)

    if (
      absoluteResolved === workspaceRoot ||
      absoluteResolved.startsWith(
        workspaceRoot.endsWith('/') ? workspaceRoot : `${workspaceRoot}/`
      )
    ) {
      return absoluteResolved
    }

    return resolved
  }

  return ensureRelativePath(resolved)
}

function normalizeExportSubpath(exportPath: string) {
  if (exportPath === '.' || exportPath === './') {
    return ''
  }

  let normalized = exportPath.replace(/^\.\/+/, '')
  const wildcardIndex = normalized.indexOf('*')

  if (wildcardIndex !== -1) {
    normalized = normalized.slice(0, wildcardIndex)
  }

  return trimTrailingSlashes(normalized)
}

function isDirectoryLikeExport(exportPath: string) {
  if (exportPath === '.' || exportPath === './') {
    return true
  }

  if (exportPath.startsWith('#')) {
    return false
  }

  const normalized = exportPath.replace(/^\.\/+/, '')

  if (!normalized) {
    return true
  }

  if (normalized.includes('*')) {
    return true
  }

  const lastSegment = normalized.split('/').pop()!
  return !lastSegment.includes('.')
}

function isWildcardExport(exportPath: string) {
  return exportPath.includes('*')
}

function normalizePackageExportSpecifier(
  specifier: string,
  packageName?: string
) {
  let normalized = normalizeSlashes(specifier).trim()

  if (!normalized || normalized === '.' || normalized === './') {
    return ''
  }

  if (packageName) {
    const normalizedPackageName = normalizeSlashes(packageName)

    if (
      normalized === normalizedPackageName ||
      normalized.startsWith(`${normalizedPackageName}/`)
    ) {
      normalized = normalized.slice(normalizedPackageName.length)
    }
  }

  normalized = normalized.replace(/^\/+/g, '')

  if (!normalized || normalized === '.' || normalized === './') {
    return ''
  }

  return normalizeExportSubpath(normalized)
}

function resolvePackageExportRelativePath(
  specifier: string,
  exportPath: string,
  isPattern: boolean
) {
  const baseSubpath = normalizeExportSubpath(exportPath)

  if (!specifier) {
    if (!isPattern && baseSubpath === '') {
      return ''
    }

    return undefined
  }

  if (!isPattern) {
    return specifier === baseSubpath ? '' : undefined
  }

  if (!baseSubpath) {
    return specifier
  }

  if (!specifier.startsWith(baseSubpath)) {
    return undefined
  }

  if (specifier.length === baseSubpath.length) {
    return undefined
  }

  const remainder = specifier.slice(baseSubpath.length)

  if (!remainder.startsWith('/')) {
    return undefined
  }

  const relative = remainder.slice(1)
  return relative.length > 0 ? relative : undefined
}

const WORKSPACE_DIRECTORY_SKIP = new Set([
  'node_modules',
  '.git',
  '.turbo',
  '.next',
  'dist',
  'build',
  'out',
  '.pnpm',
])

function readTextFile(fileSystem: FileSystem, path: string) {
  return fileSystem.readFileSync(path)
}

function readJsonFile<T = any>(
  fileSystem: FileSystem,
  path: string,
  context: string
) {
  const contents = readTextFile(fileSystem, path)
  try {
    return JSON.parse(contents) as T
  } catch (error) {
    throw new Error(`[renoun] Failed to parse ${context}.`, { cause: error })
  }
}

function safeFileExistsSync(fileSystem: FileSystem, path: string) {
  try {
    return fileSystem.fileExistsSync(path)
  } catch {
    return false
  }
}

function safeReadDirectory(fileSystem: FileSystem, path: string) {
  try {
    return fileSystem.readDirectorySync(path)
  } catch {
    return []
  }
}

function resolveSearchStartDirectory(
  directory?: Directory<any, any, any> | PathLike
) {
  if (isDirectoryInstance(directory)) {
    return normalizeSlashes(directory.absolutePath)
  }

  if (directory) {
    return normalizeSlashes(resolveSchemePath(directory))
  }

  if (typeof process !== 'undefined' && typeof process.cwd === 'function') {
    return normalizeSlashes(process.cwd())
  }

  return normalizeSlashes(getRootDirectory())
}

function normalizeWorkspaceRelative(path: string) {
  const normalized = normalizeSlashes(path)
  if (!normalized || normalized === '.' || normalized === './') {
    return ''
  }
  return normalized.replace(/^\.\/+/, '')
}

function buildWorkspacePatterns(fileSystem: FileSystem, workspaceRoot: string) {
  const patterns: string[] = []
  const pnpmWorkspacePath = joinPaths(workspaceRoot, 'pnpm-workspace.yaml')

  if (safeFileExistsSync(fileSystem, pnpmWorkspacePath)) {
    const manifest = readTextFile(fileSystem, pnpmWorkspacePath)
    patterns.push(...parsePnpmWorkspacePackages(manifest))
  }

  const workspacePackageJsonPath = joinPaths(workspaceRoot, 'package.json')

  if (safeFileExistsSync(fileSystem, workspacePackageJsonPath)) {
    const packageJson = readJsonFile<PackageJson>(
      fileSystem,
      workspacePackageJsonPath,
      `package.json at "${workspacePackageJsonPath}"`
    )
    const workspaces = packageJson.workspaces

    if (Array.isArray(workspaces)) {
      patterns.push(...workspaces.map((entry) => entry.toString()))
    } else if (workspaces && Array.isArray(workspaces.packages)) {
      patterns.push(...workspaces.packages.map((entry) => entry.toString()))
    }
  }

  return patterns
    .map((pattern) => pattern.trim())
    .filter((pattern) => pattern && !pattern.startsWith('!'))
}

function parsePnpmWorkspacePackages(source: string) {
  const packages: string[] = []
  const lines = source.split(/\r?\n/)
  let inPackages = false
  let indentLevel: number | undefined

  for (const line of lines) {
    if (!inPackages) {
      if (/^\s*packages\s*:/i.test(line)) {
        inPackages = true
        indentLevel = line.match(/^(\s*)/)?.[1]?.length ?? 0
      }
      continue
    }

    if (/^\s*$/.test(line) || /^\s*#/.test(line)) {
      continue
    }

    const currentIndent = line.match(/^(\s*)/)?.[1]?.length ?? 0

    if (indentLevel !== undefined && currentIndent <= indentLevel) {
      break
    }

    const match = line.match(/^\s*-\s*(.+)$/)
    if (match) {
      const value = match[1]!.trim().replace(/^['"]|['"]$/g, '')
      if (value) {
        packages.push(value)
      }
    }
  }

  return packages
}

function getWorkspacePatternBase(pattern: string) {
  const normalized = normalizeWorkspaceRelative(pattern)
  if (!normalized) {
    return ''
  }

  const wildcardIndex = normalized.search(/[\*\?\[{]/)
  if (wildcardIndex === -1) {
    return trimTrailingSlashes(normalized)
  }

  return trimTrailingSlashes(normalized.slice(0, wildcardIndex))
}

function buildWorkspaceSearchRoots(patterns: string[]) {
  const bases = new Set<string>()
  for (const pattern of patterns) {
    const base = getWorkspacePatternBase(pattern)
    bases.add(base)
  }

  if (bases.size === 0) {
    bases.add('')
  }

  return Array.from(bases)
}

function traverseWorkspaceDirectories(
  fileSystem: FileSystem,
  packageName: string,
  matchers: Minimatch[],
  start: string
): string | undefined {
  const queue: string[] = [normalizeWorkspaceRelative(start)]
  const visited = new Set<string>()

  while (queue.length > 0) {
    const relative = queue.shift() ?? ''
    const normalized = normalizeWorkspaceRelative(relative)

    if (visited.has(normalized)) {
      continue
    }

    visited.add(normalized)

    const directoryPath = normalized ? normalized : '.'
    const packageJsonPath = normalized
      ? joinPaths(normalized, 'package.json')
      : 'package.json'

    if (safeFileExistsSync(fileSystem, packageJsonPath)) {
      const packageJson = readJsonFile<PackageJson>(
        fileSystem,
        packageJsonPath,
        `package.json at "${packageJsonPath}"`
      )

      if (
        packageJson.name === packageName &&
        matchers.some((matcher) => matcher.match(normalized || '.'))
      ) {
        return normalized
          ? normalizePackagePath(normalized)
          : normalizePackagePath('.')
      }
    }

    for (const entry of safeReadDirectory(fileSystem, directoryPath)) {
      if (!entry.isDirectory) {
        continue
      }
      if (WORKSPACE_DIRECTORY_SKIP.has(entry.name)) {
        continue
      }
      const child = normalized ? joinPaths(normalized, entry.name) : entry.name
      queue.push(child)
    }
  }
}

function tryResolveWorkspacePackage(
  packageName: string | undefined,
  fileSystem: FileSystem,
  directory?: Directory<any, any, any> | PathLike
) {
  if (!packageName) {
    return
  }

  const startDirectory = resolveSearchStartDirectory(directory)
  const workspaceRoot = normalizeSlashes(getRootDirectory(startDirectory))
  const patterns = buildWorkspacePatterns(fileSystem, workspaceRoot)

  if (patterns.length === 0) {
    return
  }

  const matchers = patterns.map(
    (pattern) =>
      new Minimatch(normalizeWorkspaceRelative(pattern) || '.', { dot: true })
  )
  const roots = buildWorkspaceSearchRoots(patterns)

  for (const root of roots) {
    const resolved = traverseWorkspaceDirectories(
      fileSystem,
      packageName,
      matchers,
      root
    )
    if (resolved) {
      return resolved
    }
  }
}

function tryResolveNodeModulesPackage(
  packageName: string | undefined,
  fileSystem: FileSystem,
  directory?: Directory<any, any, any> | PathLike
) {
  if (!packageName) {
    return
  }

  const startDirectory = resolveSearchStartDirectory(directory)
  const workspaceRoot = normalizeSlashes(getRootDirectory(startDirectory))
  let currentDirectory = normalizeSlashes(startDirectory)

  while (true) {
    const relativeToRoot = normalizeWorkspaceRelative(
      relativePath(workspaceRoot, currentDirectory)
    )
    const candidate = relativeToRoot
      ? joinPaths(relativeToRoot, 'node_modules', packageName)
      : joinPaths('node_modules', packageName)
    const packageJsonPath = joinPaths(candidate, 'package.json')

    if (safeFileExistsSync(fileSystem, packageJsonPath)) {
      return normalizePackagePath(candidate)
    }

    if (normalizeSlashes(currentDirectory) === workspaceRoot) {
      break
    }

    const parent = directoryName(currentDirectory)
    if (parent === currentDirectory) {
      break
    }
    currentDirectory = parent
  }
}

export class Workspace {
  #fileSystem: FileSystem
  #workspaceRoot: string
  #workspaceRelativeRoot: string

  constructor(
    options: { fileSystem?: FileSystem; rootDirectory?: PathLike } = {}
  ) {
    this.#fileSystem = options.fileSystem ?? new NodeFileSystem()
    const resolvedRoot = normalizeSlashes(
      resolveSchemePath(options.rootDirectory ?? getRootDirectory())
    )

    this.#workspaceRoot = resolvedRoot.startsWith('/')
      ? resolvedRoot
      : this.#fileSystem.getAbsolutePath(resolvedRoot)
    const relativeRoot = normalizeWorkspaceRelative(resolvedRoot)
    this.#workspaceRelativeRoot = relativeRoot || '.'
  }

  hasWorkspaces() {
    const workspaceRoot = this.#workspaceRelativeRoot || this.#workspaceRoot
    return buildWorkspacePatterns(this.#fileSystem, workspaceRoot).length > 0
  }

  getPackageManager(): 'pnpm' | 'yarn' | 'npm' | 'bun' | 'unknown' {
    const candidates: Array<[string, 'pnpm' | 'yarn' | 'npm' | 'bun']> = [
      ['pnpm-lock.yaml', 'pnpm'],
      ['yarn.lock', 'yarn'],
      ['package-lock.json', 'npm'],
      ['npm-shrinkwrap.json', 'npm'],
      ['bun.lockb', 'bun'],
    ]

    for (const [file, manager] of candidates) {
      if (this.#findWorkspacePath(file)) {
        return manager
      }
    }

    return 'unknown'
  }

  getPackage(name: string) {
    return this.getPackages().find((pkg) => pkg.name === name)
  }

  async getStructure(): Promise<
    Array<
      WorkspaceStructure | PackageStructure | DirectoryStructure | FileStructure
    >
  > {
    let workspaceName = 'workspace'
    const rootPackageJsonPath = this.#findWorkspacePath('package.json')

    if (rootPackageJsonPath) {
      try {
        const packageJson = readJsonFile<{ name?: string }>(
          this.#fileSystem,
          rootPackageJsonPath,
          `package.json at "${rootPackageJsonPath}"`
        )
        if (packageJson?.name) {
          workspaceName = packageJson.name
        }
      } catch {
        // fall back to default workspace name on read/parse errors
      }
    }

    const workspaceSlug = createSlug(workspaceName, 'kebab')

    const structures: Array<
      WorkspaceStructure | PackageStructure | DirectoryStructure | FileStructure
    > = [
      {
        type: 'workspace',
        name: workspaceName,
        title: formatNameAsTitle(workspaceName),
        slug: workspaceSlug,
        path: '/',
        packageManager: this.getPackageManager(),
      },
    ]

    for (const pkg of this.getPackages()) {
      const packageStructures = await pkg.getStructure()
      structures.push(...packageStructures)
    }

    return structures
  }

  getPackages(): Package<InferDirectoryLoaderTypes<DirectoryLoader>>[] {
    return this.#getWorkspacePackageEntries().map(
      ({ name, path }) =>
        new Package({
          name,
          path,
          fileSystem: this.#fileSystem,
        })
    )
  }

  #getWorkspacePackageEntries() {
    const packageEntries: { name?: string; path: string }[] = []
    const workspaceRoot = this.#workspaceRelativeRoot || this.#workspaceRoot
    const patterns = buildWorkspacePatterns(this.#fileSystem, workspaceRoot)

    if (patterns.length === 0) {
      const rootPackageJsonPath = this.#findWorkspacePath('package.json')

      if (rootPackageJsonPath) {
        const packageJson = readJsonFile<PackageJson>(
          this.#fileSystem,
          rootPackageJsonPath,
          `package.json at "${rootPackageJsonPath}"`
        )
        packageEntries.push({
          name: packageJson.name,
          path: directoryName(rootPackageJsonPath) || '.',
        })
      }

      return packageEntries
    }

    const matchers = patterns.map(
      (pattern) =>
        new Minimatch(normalizeWorkspaceRelative(pattern) || '.', { dot: true })
    )
    const roots = buildWorkspaceSearchRoots(patterns)
    const visited = new Set<string>()

    for (const root of roots) {
      const queue: string[] = [normalizeWorkspaceRelative(root)]

      while (queue.length > 0) {
        const relative = queue.shift() ?? ''
        const normalized = normalizeWorkspaceRelative(relative)

        if (visited.has(normalized)) {
          continue
        }

        visited.add(normalized)

        const packageJsonPath = this.#findWorkspacePath(
          normalized ? joinPaths(normalized, 'package.json') : 'package.json'
        )

        if (
          matchers.some((matcher) => matcher.match(normalized || '.')) &&
          packageJsonPath
        ) {
          const packageJson = readJsonFile<PackageJson>(
            this.#fileSystem,
            packageJsonPath,
            `package.json at "${packageJsonPath}"`
          )
          const packagePath = directoryName(packageJsonPath)

          packageEntries.push({
            name: packageJson.name,
            path: packagePath,
          })
        }

        const directoryPath = this.#resolveWorkspacePath(normalized || '.')

        for (const entry of safeReadDirectory(
          this.#fileSystem,
          directoryPath
        )) {
          if (!entry.isDirectory || WORKSPACE_DIRECTORY_SKIP.has(entry.name)) {
            continue
          }

          const child = normalized
            ? joinPaths(normalized, entry.name)
            : entry.name
          queue.push(child)
        }
      }
    }

    return packageEntries
  }

  #findWorkspacePath(path: string) {
    const absolutePath = this.#resolveWorkspacePath(path)
    if (safeFileExistsSync(this.#fileSystem, absolutePath)) {
      return absolutePath
    }

    const relativePath = this.#resolveWorkspacePath(path, true)
    if (
      relativePath !== absolutePath &&
      safeFileExistsSync(this.#fileSystem, relativePath)
    ) {
      return relativePath
    }
  }

  #resolveWorkspacePath(path: string, preferRelative?: boolean) {
    const base =
      preferRelative || this.#workspaceRelativeRoot
        ? this.#workspaceRelativeRoot
        : this.#workspaceRoot
    const normalizedBase = base === '.' ? '' : base
    return normalizedBase ? joinPaths(normalizedBase, path) : path
  }
}

function resolveRepositorySpecifier(
  repository?: Repository | RepositoryConfig | string
) {
  if (!repository) {
    return
  }

  if (repository instanceof Repository) {
    return parseGitSpecifier(repository.toString())
  }

  if (typeof repository === 'string') {
    return parseGitSpecifier(repository)
  }

  if (repository.owner && repository.repository && repository.host) {
    return {
      host: repository.host,
      owner: repository.owner,
      repo: repository.repository,
      ref: repository.branch,
      path: repository.path,
    }
  }
}

function isPathLikeValue(value: unknown): value is PathLike {
  if (typeof value === 'string') {
    return true
  }

  return typeof URL !== 'undefined' && value instanceof URL
}

export class Package<
  Types extends InferDirectoryLoaderTypes<Loaders>,
  LoaderTypes extends WithDefaultTypes<Types> = WithDefaultTypes<Types>,
  Loaders extends DirectoryLoader = DirectoryLoader,
  ExportLoaders extends PackageExportLoaderMap = {},
> {
  #name?: string
  #packagePath: string
  #sourceRootPath: string
  #fileSystem: FileSystem
  #packageJson?: PackageJson
  #packageAbsolutePath?: string
  #repository?: Repository | RepositoryConfig | string
  #exportLoaders?: ExportLoaders | PackageExportLoader<ModuleExports<any>>
  #exportOverrides?: Record<
    string,
    PackageExportOptions<Types, LoaderTypes, Loaders>
  >
  #exportDirectories?: PackageExportDirectory<Types, LoaderTypes, Loaders>[]
  #importEntries?: PackageImportEntry[]
  #exportManifestEntries?: Map<string, PackageManifestEntry>
  #importManifestEntries?: Map<string, PackageManifestEntry>

  constructor(
    options: PackageOptions<Types, LoaderTypes, Loaders, ExportLoaders>
  ) {
    if (!options?.name && !options?.path) {
      throw new Error(
        '[renoun] A package "name" or explicit "path" must be provided.'
      )
    }

    let startDirectory: Directory<any, any, any> | PathLike | undefined
    if (isDirectoryInstance(options.directory)) {
      startDirectory = options.directory
    } else if (isPathLikeValue(options.directory)) {
      startDirectory = options.directory
    }

    const repositoryInstance =
      options.repository instanceof Repository
        ? options.repository
        : options.repository
          ? new Repository(options.repository)
          : undefined
    const { fileSystem, packagePath } = this.#resolvePackageLocation({
      name: options.name,
      path: options.path,
      directory: startDirectory,
      repository: options.repository ?? repositoryInstance,
      fileSystem: options.fileSystem ?? new NodeFileSystem(),
    })

    this.#fileSystem = fileSystem
    this.#packagePath = packagePath
    this.#name = options.name
    this.#repository = options.repository ?? repositoryInstance
    this.#exportOverrides = options.exports
    this.#exportLoaders = options.loader
    this.#sourceRootPath =
      options.sourcePath === null
        ? this.#packagePath
        : this.#resolveWithinPackage(options.sourcePath ?? 'src')
  }

  get name() {
    return this.#name
  }

  getExports(): PackageExportDirectory<Types, LoaderTypes, Loaders>[] {
    if (!this.#exportDirectories) {
      this.#exportDirectories = this.#buildExportDirectories()
    }

    return this.#exportDirectories
  }

  async getStructure(): Promise<
    Array<PackageStructure | DirectoryStructure | FileStructure>
  > {
    this.#ensurePackageJsonLoaded()

    const packageJson = this.#packageJson
    const name =
      this.#name ??
      packageJson?.name ??
      formatNameAsTitle(baseName(this.#packagePath))
    const relativePath = this.#fileSystem.getRelativePathToWorkspace(
      this.#packagePath
    )
    const normalizedRelativePath =
      relativePath === '.' ? '' : normalizeSlashes(relativePath)
    const path =
      normalizedRelativePath === ''
        ? '/'
        : `/${normalizedRelativePath.replace(/^\/+/, '')}`

    const structures: Array<
      PackageStructure | DirectoryStructure | FileStructure
    > = [
      {
        type: 'package',
        name,
        title: formatNameAsTitle(name),
        slug: createSlug(name, 'kebab'),
        path,
        version: packageJson?.version,
        description: packageJson?.description,
        relativePath: normalizedRelativePath || '.',
      },
    ]

    for (const directory of this.getExports()) {
      const directoryStructures = await directory.getStructure()
      structures.push(...directoryStructures)
    }

    return structures
  }

  async getExport<Key extends keyof ExportLoaders & string>(
    exportSpecifier: Key,
    extension?: string | string[]
  ): Promise<
    JavaScriptFile<InferPackageExportModule<ExportLoaders[Key]>, LoaderTypes>
  >
  async getExport<Module extends ModuleExports<any>>(
    exportSpecifier: string,
    extension?: string | string[]
  ): Promise<JavaScriptFile<Module, LoaderTypes>>
  async getExport(
    exportSpecifier: string,
    extension?: string | string[]
  ): Promise<FileSystemEntry<LoaderTypes>>
  async getExport(
    exportSpecifier: string,
    extension?: string | string[]
  ): Promise<any> {
    const normalizedSpecifier = normalizePackageExportSpecifier(
      exportSpecifier,
      this.#name
    )
    const directories = this.getExports()
    const manifestEntries = this.#getManifestEntries('exports')
    const patternBases = new Set<string>()

    for (const entry of manifestEntries.values()) {
      if (entry.isPattern) {
        const normalizedBase = normalizeExportSubpath(entry.key)
        patternBases.add(normalizedBase)
      }
    }
    let match:
      | {
          directory: PackageExportDirectory<Types, LoaderTypes, Loaders>
          relativePath: string
          baseLength: number
          relativeLength: number
        }
      | undefined

    for (const directory of directories) {
      const exportPath = directory.getExportPath()
      const analysis = directory.getAnalysis()
      const baseSubpath = normalizeExportSubpath(exportPath)
      const manifestPattern = patternBases.has(baseSubpath)
      const isPattern =
        (analysis?.isPattern ?? isWildcardExport(exportPath)) || manifestPattern
      const relativePath = resolvePackageExportRelativePath(
        normalizedSpecifier,
        exportPath,
        isPattern
      )

      if (relativePath === undefined) {
        continue
      }

      const baseLength = baseSubpath.length
      const relativeLength = relativePath.length

      if (
        !match ||
        baseLength > match.baseLength ||
        (baseLength === match.baseLength &&
          relativeLength < match.relativeLength)
      ) {
        match = { directory, relativePath, baseLength, relativeLength }
      }
    }

    if (!match) {
      throw new Error(
        `[renoun] Export "${exportSpecifier}" was not found in package "${this.#name ?? this.#packagePath}".`
      )
    }

    if (match.relativePath === '') {
      return match.directory
    }

    return match.directory.getFile(match.relativePath, extension)
  }

  getImports() {
    if (!this.#importEntries) {
      const manifestEntries = this.#getManifestEntries('imports')

      this.#importEntries = Array.from(manifestEntries.values()).map(
        (entry) =>
          new PackageImportEntry({
            key: entry.key,
            type: 'imports',
            source: 'manifest',
            isPattern: entry.isPattern,
            manifestTarget: entry.target,
          })
      )
    }

    return this.#importEntries
  }

  /** Get a single import entry by its specifier (e.g. "#internal/*"). */
  getImport(importSpecifier: string): PackageImportEntry | undefined {
    return this.getImports().find(
      (entry) => entry.getImportPath() === importSpecifier
    )
  }

  #ensurePackageJsonLoaded() {
    if (!this.#packageJson) {
      const packageJson = this.#readPackageJson()
      this.#packageJson = packageJson
      if (!this.#name && packageJson.name) {
        this.#name = packageJson.name
      }
    }
  }

  #getPackageAbsolutePath() {
    if (!this.#packageAbsolutePath) {
      this.#packageAbsolutePath = this.#fileSystem.getAbsolutePath(
        this.#packagePath
      )
    }

    return this.#packageAbsolutePath
  }

  #readPackageJson(): PackageJson {
    const packageJsonPath = joinPaths(this.#packagePath, 'package.json')
    try {
      return readJsonFile<PackageJson>(
        this.#fileSystem,
        packageJsonPath,
        `package.json at "${packageJsonPath}"`
      )
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.startsWith('[renoun] Failed to parse package.json')
      ) {
        throw error
      }

      throw new Error(
        `[renoun] Failed to read package.json at "${packageJsonPath}".`,
        { cause: error }
      )
    }
  }

  #resolveWithinPackage(path: PathLike) {
    const resolved = resolveSchemePath(path)

    if (resolved.startsWith('/')) {
      return resolved
    }

    return joinPaths(this.#packagePath, resolved)
  }

  #getManifestEntries(type: PackageEntryType) {
    this.#ensurePackageJsonLoaded()

    if (type === 'exports') {
      if (!this.#exportManifestEntries) {
        this.#exportManifestEntries = createManifestEntryMap(
          this.#packageJson!.exports,
          'exports',
          this.#packagePath,
          this.#fileSystem
        )
      }

      return this.#exportManifestEntries
    }

    if (!this.#importManifestEntries) {
      this.#importManifestEntries = createManifestEntryMap(
        this.#packageJson!.imports,
        'imports',
        this.#packagePath,
        this.#fileSystem
      )
    }

    return this.#importManifestEntries
  }

  #resolvePackageExportKeys() {
    const manifestEntries = this.#getManifestEntries('exports')
    const deduped = new Map<string, { key: string; wildcard: boolean }>()

    const addKey = (key: string) => {
      if (!isDirectoryLikeExport(key)) {
        return
      }

      const normalized = normalizeExportSubpath(key)
      const dedupeKey = normalized || '.'
      const wildcard = isWildcardExport(key)
      const existing = deduped.get(dedupeKey)

      if (!existing || (existing.wildcard && !wildcard)) {
        deduped.set(dedupeKey, { key, wildcard })
      }
    }

    if (manifestEntries.size === 0) {
      addKey('.')
    } else {
      for (const key of manifestEntries.keys()) {
        addKey(key)
      }
    }

    return Array.from(deduped.values()).map((entry) => entry.key)
  }

  #buildExportDirectories() {
    const directories: PackageExportDirectory<Types, LoaderTypes, Loaders>[] =
      []
    const packageExportKeys = this.#resolvePackageExportKeys()
    const overrideKeys = this.#exportOverrides
      ? Object.keys(this.#exportOverrides)
      : []
    const keys = packageExportKeys.slice()
    const manifestEntries = this.#getManifestEntries('exports')

    // Normalize the optional per‑export loader map to the same subpath
    // format used when matching exports (`normalizePackageExportSpecifier`
    // / `normalizeExportSubpath`).
    const loaderOption = this.#exportLoaders
    const exportLoaderResolver =
      typeof loaderOption === 'function' ? loaderOption : undefined
    const exportLoaderMap =
      loaderOption && typeof loaderOption === 'object'
        ? (loaderOption as ExportLoaders)
        : undefined
    const normalizedExportLoaders = new Map<string, Loaders>()
    const resolverLoaderCache = new Map<string, Loaders>()

    if (exportLoaderMap) {
      for (const [rawKey, loader] of Object.entries(exportLoaderMap)) {
        if (!loader) continue
        const normalizedSpecifier = normalizePackageExportSpecifier(
          rawKey,
          this.#name
        )

        // Skip root export mappings for now – they would apply to the
        // package root directory and are not needed for current use‑cases.
        if (!normalizedSpecifier) continue

        // Map the loader to the base export subpath so that keys like
        // "remark/add-sections" will be associated with the "./remark/*"
        // export directory.
        const baseSubpath =
          normalizeExportSubpath(normalizedSpecifier).split('/')[0]

        if (!baseSubpath) continue

        normalizedExportLoaders.set(baseSubpath, {
          ...createPackageExportModuleLoaders(loader, baseSubpath),
        } as Loaders)
      }
    }

    const resolveResolverLoaderForSubpath = (subpath: string) => {
      if (!exportLoaderResolver) {
        return undefined
      }

      if (!resolverLoaderCache.has(subpath)) {
        resolverLoaderCache.set(subpath, {
          ...createPackageExportModuleLoaders(exportLoaderResolver, subpath),
        } as Loaders)
      }

      return resolverLoaderCache.get(subpath)
    }

    for (const key of overrideKeys) {
      if (!keys.includes(key)) {
        keys.push(key)
      }
    }

    for (const exportKey of keys) {
      const override = this.#exportOverrides?.[exportKey]
      const { path: overridePath, ...overrideOptions } = override ?? {}
      const normalizedExportSubpath = normalizeExportSubpath(exportKey)
      const directoryPath = normalizePackagePath(
        overridePath
          ? this.#resolveWithinPackage(overridePath)
          : this.#resolveDerivedPath(exportKey)
      )
      const manifestEntry = manifestEntries.get(exportKey)
      const derivedAbsolutePath =
        this.#fileSystem.getAbsolutePath(directoryPath)
      const packageAbsolutePath = this.#getPackageAbsolutePath()
      const relativeFromPackage =
        relativePath(packageAbsolutePath, derivedAbsolutePath) || '.'
      const analysis: PackageExportAnalysis = {
        key: exportKey,
        type: 'exports',
        source: manifestEntry ? 'manifest' : 'override',
        isPattern: manifestEntry?.isPattern ?? isWildcardExport(exportKey),
        manifestTarget: manifestEntry?.target,
        derivedAbsolutePath,
        derivedRelativePath:
          relativeFromPackage === ''
            ? '.'
            : normalizeSlashes(relativeFromPackage),
      }
      const directory = new PackageExportDirectory<Types, LoaderTypes, Loaders>(
        exportKey,
        {
          ...overrideOptions,
          path: directoryPath,
          fileSystem: this.#fileSystem,
          repository: this.#repository,
          // If a loader was provided at the `Package` level for this export
          // subpath and no explicit loader override exists for this export,
          // adapt it into a per‑extension loader map for the directory.
          loader:
            overrideOptions.loader ??
            normalizedExportLoaders.get(normalizedExportSubpath) ??
            resolveResolverLoaderForSubpath(normalizedExportSubpath),
        },
        analysis
      )
      directories.push(directory)
    }

    return directories
  }

  #resolveDerivedPath(exportKey: string) {
    const subpath = normalizeExportSubpath(exportKey)

    if (!subpath) {
      return this.#sourceRootPath
    }

    return joinPaths(this.#sourceRootPath, subpath)
  }

  #resolvePackageLocation({
    name,
    path,
    directory,
    repository,
    fileSystem,
  }: {
    name?: string
    path?: PathLike
    directory?: Directory<any, any, any> | PathLike
    repository?: Repository | RepositoryConfig | string
    fileSystem: FileSystem
  }) {
    if (path) {
      return {
        fileSystem,
        packagePath: normalizePackagePath(path),
      }
    }

    const workspacePath = tryResolveWorkspacePackage(
      name,
      fileSystem,
      directory
    )
    if (workspacePath) {
      return { fileSystem, packagePath: workspacePath }
    }

    const nodeModulesPath = tryResolveNodeModulesPackage(
      name,
      fileSystem,
      directory
    )
    if (nodeModulesPath) {
      return { fileSystem, packagePath: nodeModulesPath }
    }

    if (repository) {
      const remote = this.#resolveRepositoryPackage(repository)
      if (remote) {
        return remote
      }
    }

    if (name) {
      throw new Error(
        `[renoun] Failed to locate package "${name}". Provide a "path", install it locally, or configure a "repository".`
      )
    }

    throw new Error(
      '[renoun] A package "name" or explicit "path" must be provided.'
    )
  }

  #resolveRepositoryPackage(
    repository: Repository | RepositoryConfig | string
  ) {
    const specifier = resolveRepositorySpecifier(repository)

    if (!specifier) {
      return
    }

    const { host, owner, repo, ref, path } = specifier

    if (!owner || !repo) {
      return
    }

    if (host === 'pierre') {
      throw new Error(
        '[renoun] Pierre repositories are not supported for package export analysis.'
      )
    }

    const gitHost = host as 'github' | 'gitlab' | 'bitbucket'
    const gitFileSystem = new GitHostFileSystem({
      repository: `${owner}/${repo}`,
      host: gitHost,
      ref,
    })

    return {
      fileSystem: gitFileSystem,
      packagePath: normalizePackagePath(path ?? '.'),
    }
  }
}

export class PackageImportEntry {
  #analysis: PackageImportAnalysis

  constructor(analysis: PackageImportAnalysis) {
    this.#analysis = analysis
  }

  getImportPath() {
    return this.#analysis.key
  }

  getAnalysis() {
    return this.#analysis
  }
}

/**
 * Adapts a `Package` export loader (which does not receive path/file
 * information) into a per‑extension `ModuleLoaders` map that can be
 * consumed by `Directory` / `JavaScriptFile`.
 *
 * We intentionally wire the same runtime for the common JavaScript‑like
 * extensions so that whichever concrete file extension is present for the
 * package export can still resolve the runtime module.
 */
function createPackageExportModuleLoaders(
  exportLoader: PackageExportLoader<ModuleExports<any>>,
  baseSubpath?: string
): ModuleLoaders {
  const normalizedBase =
    baseSubpath && baseSubpath.length ? normalizeSlashes(baseSubpath) : ''
  const runtimeLoader: ModuleRuntimeLoader<any> = (relativePath) => {
    const normalizedRelative = relativePath
      ? normalizeSlashes(relativePath)
      : ''
    const loaderPath =
      normalizedBase && normalizedRelative
        ? `${normalizedBase}/${normalizedRelative}`
        : normalizedBase || normalizedRelative
    const normalizedPath =
      loaderPath.length && !loaderPath.startsWith('/')
        ? `/${loaderPath}`
        : loaderPath

    return exportLoader(normalizedPath)
  }

  return {
    js: runtimeLoader,
    jsx: runtimeLoader,
    ts: runtimeLoader,
    tsx: runtimeLoader,
    mjs: runtimeLoader,
    cjs: runtimeLoader,
  }
}
