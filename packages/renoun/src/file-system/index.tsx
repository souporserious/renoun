import * as React from 'react'
import type {
  MDXContent,
  MDXComponents,
  Headings,
  SlugCasing,
} from '@renoun/mdx'
import { rehypePlugins } from '@renoun/mdx/rehype'
import { remarkPlugins } from '@renoun/mdx/remark'
import {
  createSlug,
  getMDXExportStaticValues,
  getMDXContent,
  getMDXHeadings,
  getMarkdownHeadings,
  parseFrontMatter,
  type FrontMatterParseResult,
} from '@renoun/mdx/utils'
import { Minimatch } from 'minimatch'

import { CodeBlock, parsePreProps } from '../components/CodeBlock/index.js'
import { CodeInline, parseCodeProps } from '../components/CodeInline.js'
import { Markdown, type MarkdownComponents } from '../components/Markdown.js'
import { getFileExportMetadata } from '../project/client.js'
import { formatNameAsTitle } from '../utils/format-name-as-title.js'
import { getClosestFile } from '../utils/get-closest-file.js'
import {
  getEditorUri,
  type GetEditorUriOptions,
} from '../utils/get-editor-uri.js'
import { getLocalGitFileMetadata } from '../utils/get-local-git-file-metadata.js'
import type { GitMetadata } from '../utils/get-local-git-file-metadata.js'
import {
  isJavaScriptLikeExtension,
  type IsJavaScriptLikeExtension,
  type HasJavaScriptLikeExtensions,
} from '../utils/is-javascript-like-extension.js'
import {
  baseName,
  ensureRelativePath,
  extensionName,
  joinPaths,
  normalizeSlashes,
  resolveSchemePath,
  removeExtension,
  removeAllExtensions,
  removeOrderPrefixes,
  relativePath,
  type PathLike,
} from '../utils/path.js'
import { getRootDirectory } from '../utils/get-root-directory.js'
import type { TypeFilter } from '../utils/resolve-type.js'
import type {
  FileReadableStream,
  FileSystem,
  FileSystemWriteFileContent,
  FileWritableStream,
} from './FileSystem.js'
import { NodeFileSystem } from './NodeFileSystem.js'
import {
  Repository,
  type RepositoryConfig,
  type GetFileUrlOptions,
  type GetDirectoryUrlOptions,
  type GetReleaseOptions,
  type GetReleaseUrlOptions,
  type Release,
} from './Repository.js'
import {
  DirectorySnapshot,
  createDirectorySnapshot,
  type DirectorySnapshotDirectoryMetadata,
} from './directory-snapshot'
import type { StandardSchemaV1 } from './standard-schema.js'
import type { ExtractFileExtension, IsNever } from './types.js'

export { FileSystem } from './FileSystem.js'
export { GitHostFileSystem } from './GitHostFileSystem.js'
export { MemoryFileSystem } from './MemoryFileSystem.js'
export { NodeFileSystem } from './NodeFileSystem.js'
export { Repository } from './Repository.js'

const markdownComponents = {
  pre: (props) => <CodeBlock {...parsePreProps(props)} />,
  code: (props) => <CodeInline {...parseCodeProps(props)} />,
} satisfies MDXComponents & MarkdownComponents

const defaultLoaders: {
  md: ModuleLoader<any>
  mdx: ModuleLoader<any>
  [extension: string]: ModuleLoader<any>
} = {
  md: async (_, file) => {
    const value = await file.getText()
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
      source = await fileSystem.readFile(file.getRelativePathToWorkspace())
    } catch (relativeError) {
      try {
        source = await fileSystem.readFile(file.getAbsolutePath())
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
type ModuleExports<Value = any> = {
  [exportName: string]: Value
}

type SourceReleaseOptions = GetReleaseOptions & {
  repository?: RepositoryConfig | string | Repository
}

type SourceReleaseUrlOptions = GetReleaseUrlOptions & {
  repository?: RepositoryConfig | string | Repository
}

/** A function that validates and returns a specific type. */
type ModuleExportValidator<Input = any, Output = Input> = (
  value: Input
) => Output

/** Utility type that maps a record of exports to a record of validators. */
type ModuleExportValidators<Exports extends ModuleExports> = {
  [ExportName in keyof Exports]: ModuleExportValidator<Exports[ExportName]>
}

/** Utility type that infers the schema output from validator functions or a [Standard Schema](https://github.com/standard-schema/standard-schema?tab=readme-ov-file#standard-schema-spec). */
export type InferModuleExports<Exports> = {
  [ExportName in keyof Exports]: Exports[ExportName] extends StandardSchemaV1
    ? StandardSchemaV1.InferOutput<Exports[ExportName]>
    : Exports[ExportName] extends ModuleExportValidator<any, infer Output>
      ? Output
      : Exports[ExportName]
}

/** A module loader with an optional schema and runtime. */
interface ModuleLoaderWithSchema<
  Types extends ModuleExports,
  /**
   * This is used exclusively for type inference in `InferModuleLoader` to prevent
   * unwrapping the provided types and allow passing them through as-is. Without this
   * flag, TypeScript would infer the provided types as a `ModuleExportValidator`
   * and unwrap them.
   */
  _IsRuntimeOnly extends boolean = false,
> {
  schema: Types
  runtime?: ModuleRuntimeLoader<InferModuleExports<Types>>
}

/** Provides type inference for the module loader. */
export function withSchema<
  Types extends ModuleExports,
>(): ModuleLoaderWithSchema<Types>

/** A function that resolves the module runtime. */
export function withSchema<Types extends ModuleExports>(
  runtime: ModuleRuntimeLoader<NoInfer<Types> | unknown>
): ModuleLoaderWithSchema<Types, true>

/**
 * A schema that follows the Standard Schema Spec like Zod, Valibot, and Arktype
 * or custom validation functions to ensure file exports conform to a specific schema.
 */
export function withSchema<
  Types extends ModuleExports = never,
  Schema extends ModuleExports = ModuleExports,
>(
  schema: IsNever<Types> extends true
    ? Schema
    : Partial<ModuleExportValidators<NoInfer<Types>>>,
  runtime: ModuleRuntimeLoader<
    IsNever<Types> extends true ? NoInfer<Schema> : NoInfer<Types>
  >
): ModuleLoaderWithSchema<
  IsNever<Types> extends true ? Schema : ModuleExportValidators<NoInfer<Types>>
>

export function withSchema(schemaOrRuntime?: any, maybeRuntime?: any) {
  return maybeRuntime
    ? { schema: schemaOrRuntime, runtime: maybeRuntime }
    : schemaOrRuntime
}

/**
 * Type signature for the "withSchema" helper function.
 *
 * This prevents TypeScript from unifying `(path: string) => Promise<...>` with `withSchema(...)`,
 * we define a distinct "helper function" shape that only matches the uninvoked `withSchema<...>`.
 */
type WithSchema<Types extends ModuleExports> = {
  (runtime: ModuleRuntimeLoader<Types>): ModuleLoaderWithSchema<Types>

  <Schema extends ModuleExports>(
    schema: Schema,
    runtime: ModuleRuntimeLoader<Schema>
  ): ModuleLoaderWithSchema<Schema>
}

/**
 * Union of all possible loader types:
 * - A direct loader `function (path) => Promise<...>`
 * - An already-invoked `withSchema(...) object { schema?: ..., runtime?: ... }`
 * - The raw `withSchema<...>` factory function
 */
type ModuleLoader<Exports extends ModuleExports = ModuleExports> =
  | ModuleRuntimeLoader<Exports>
  | WithSchema<Exports>
  | ModuleLoaderWithSchema<Exports>

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

/** A record of loaders for different file extensions. */
type ModuleLoaders = {
  [extension: string]: ModuleLoader
}

type IsAny<Type> = 0 extends 1 & Type ? true : false

/** Infer the type of a loader based on its schema or runtime. */
type InferModuleLoaderTypes<Loader extends ModuleLoader> =
  Loader extends WithSchema<infer Schema>
    ? Schema
    : Loader extends ModuleLoaderWithSchema<infer Schema, infer IsRuntimeOnly>
      ? IsRuntimeOnly extends true
        ? Schema
        : InferModuleExports<Schema>
      : Loader extends ModuleRuntimeLoader<infer Types>
        ? /**
           * If the loader is "any", we return the types as a record to prevent
           * from widening the type to "any" when merging default module types.
           */
          IsAny<Types> extends true
          ? { [exportName: string]: any }
          : Types
        : never

/**
 * Front matter parsed from the markdown file. When using the default
 * loaders this is populated automatically (if present), and custom
 * loaders can further narrow this shape via `withSchema`.
 */
export type FrontMatter = Record<string, unknown>

/** Default module types for common file extensions. */
export interface DefaultModuleTypes {
  md: {
    default: MDXContent
    frontMatter?: FrontMatter
  }
  mdx: {
    default: MDXContent
    frontMatter?: FrontMatter
  }
  json: JSONObject
}

/** Merge default module types with custom types. */
type WithDefaultTypes<Types> = DefaultModuleTypes & Types

/** Infer default extension types for a file extension. */
type InferDefaultModuleTypes<Extension extends string> =
  Extension extends keyof DefaultModuleTypes
    ? DefaultModuleTypes[Extension]
    : ModuleExports

/** Infer extension types for all loaders in a module. */
export type InferModuleLoadersTypes<Loaders extends ModuleLoaders> = {
  [Extension in keyof Loaders]: Extension extends keyof DefaultModuleTypes
    ? DefaultModuleTypes[Extension] & InferModuleLoaderTypes<Loaders[Extension]>
    : InferModuleLoaderTypes<Loaders[Extension]>
}

/** Extract keys from runtime‑capable loaders. */
export type LoadersWithRuntimeKeys<Loaders> = Extract<
  keyof Loaders,
  'js' | 'jsx' | 'ts' | 'tsx' | 'md' | 'mdx'
>

/** Determines if the loader is a resolver. */
function isLoader(
  loader: ModuleLoader<any>
): loader is ModuleRuntimeLoader<any> {
  return typeof loader === 'function'
}

/** Determines if the loader is a resolver with a schema. */
function isLoaderWithSchema<Schema extends ModuleExports>(
  loader: ModuleLoader<Schema>
): loader is ModuleLoaderWithSchema<Schema> {
  return 'schema' in loader && 'runtime' in loader
}

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
> {
  path: Path | URL
  basePathname?: string | null
  slugCasing?: SlugCasing
  depth?: number
  directory?: Directory<
    Types,
    WithDefaultTypes<Types>,
    ModuleLoaders,
    DirectoryFilter<FileSystemEntry<Types>, Types>
  >
}

/** A file in the file system. */
export class File<
  DirectoryTypes extends Record<string, any> = Record<string, any>,
  Path extends string = string,
  Extension extends string = ExtractFileExtension<Path>,
> {
  #name: string
  #baseName: string
  #modifierName?: string
  #order?: string
  #extension?: Extension
  #path: string
  #basePathname?: string | null
  #slugCasing: SlugCasing
  #directory: Directory<DirectoryTypes>

  constructor(options: FileOptions<DirectoryTypes, Path>) {
    const resolvedPath = resolveSchemePath(options.path)
    this.#name = baseName(resolvedPath)
    this.#path = resolvedPath
    this.#basePathname = options.basePathname
    this.#slugCasing = options.slugCasing ?? 'kebab'
    this.#directory = options.directory ?? new Directory()

    const match = this.#name.match(
      /^(?:(\d+)[.-])?([^.]+)(?:\.([^.]+))?(?:\.([^.]+))?$/
    )

    if (match) {
      this.#order = match[1]
      this.#baseName = match[2] ?? this.#name
      this.#modifierName = match[4] ? match[3] : undefined
      this.#extension = (match[4] ?? match[3]) as Extension
    } else {
      this.#baseName = this.#name
    }
  }

  /** The intrinsic name of the file. */
  getName(): string {
    return this.#name
  }

  /** The base name of the file e.g. `index` in `index.ts`. */
  getBaseName(): string {
    return this.#baseName
  }

  /** The modifier name of the file if defined e.g. `test` in `index.test.ts`. */
  getModifierName(): string | undefined {
    return this.#modifierName
  }

  /** The base file name formatted as a title. */
  getTitle() {
    return formatNameAsTitle(this.#baseName)
  }

  /** The order of the file if defined. */
  getOrder(): string | undefined {
    return this.#order
  }

  /** The extension of the file if defined. */
  getExtension(): Extension {
    return this.#extension as Extension
  }

  /** Get the depth of the file starting from the root directory. */
  getDepth() {
    return this.getPathnameSegments().length - 2
  }

  /** Get the slug of the file. */
  getSlug() {
    return createSlug(this.getBaseName(), this.#slugCasing)
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
      if (['index', 'readme'].includes(this.getBaseName().toLowerCase())) {
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

  /** Get the file path relative to the root directory. */
  getRelativePathToRoot() {
    const rootPath = this.#directory.getRootPath()
    return rootPath ? relativePath(rootPath, this.#path) : this.#path
  }

  /** Get the file path relative to the workspace root. */
  getRelativePathToWorkspace() {
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
    const directoryWorkspacePath = this.#directory.getRelativePathToWorkspace()

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

  /** Get the absolute file system path. */
  getAbsolutePath() {
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
      path: this.getAbsolutePath(),
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
      this.getBaseName().toLowerCase()
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

  /** Get the source text of this file. */
  async getText(): Promise<string> {
    const fileSystem = this.#directory.getFileSystem()
    return fileSystem.readFile(this.#path)
  }

  /** Get the binary contents of this file. */
  async getBinary(): Promise<Uint8Array> {
    const fileSystem = this.#directory.getFileSystem()
    return fileSystem.readFileBinary(this.#path)
  }

  /** Get the contents of this file as an ArrayBuffer. */
  async getArrayBuffer(): Promise<ArrayBuffer> {
    const binary = await this.getBinary()
    const arrayBuffer = new ArrayBuffer(binary.byteLength)
    new Uint8Array(arrayBuffer).set(binary)
    return arrayBuffer
  }

  /** Get a readable stream for this file. */
  getStream(): FileReadableStream {
    const fileSystem = this.#directory.getFileSystem()
    return fileSystem.readFileStream(this.#path)
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
> extends FileOptions<DirectoryTypes, Path> {
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
    super(fileOptions)
    this.#schema = fileOptions.schema
  }

  async #readData(): Promise<Data> {
    const source = await this.getText()

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
                `[renoun] Schema validation failed for JSON file at path: "${this.getAbsolutePath()}"\n\nThe following issues need to be fixed:\n${issuesMessage}`
              )
            }

            value = result.value
          } else if (typeof this.#schema === 'function') {
            value = this.#schema(value)
          }
        } catch (error) {
          if (error instanceof Error) {
            throw new Error(
              `[renoun] Schema validation failed to parse JSON at file path: "${this.getAbsolutePath()}"\n\nThe following error occurred:\n${error.message}`
            )
          }
        }
      }

      return value as Data
    } catch (error) {
      const reason = error instanceof Error ? ` ${error.message}` : ''
      throw new Error(
        `[renoun] Failed to parse JSON file at path "${this.getAbsolutePath()}".${reason}`
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

/** A JavaScript file export. */
export class JavaScriptModuleExport<Value> {
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
  ): Promise<JavaScriptModuleExport<Value>> {
    const fileExport = new JavaScriptModuleExport<Value>(
      name,
      file,
      loader,
      slugCasing
    )
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
  getSlug() {
    return createSlug(this.getName(), this.#slugCasing)
  }

  /** Get the name of the export. Default exports will use the file name or declaration name if available. */
  getName() {
    if (this.#metadata === undefined) {
      return this.#name === 'default' ? this.#file.getName() : this.#name
    }
    return this.#metadata?.name || this.#name
  }

  /** The export name formatted as a title. */
  getTitle() {
    return formatNameAsTitle(this.getName())
  }

  /** Get the JS Doc description of the export. */
  getDescription() {
    return this.#metadata?.jsDocMetadata?.description
  }

  /** Get the JS Doc tags of the export. */
  getTags() {
    return this.#metadata?.jsDocMetadata?.tags
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
  async getText({
    includeDependencies,
  }: { includeDependencies?: boolean } = {}) {
    const location = await this.#getLocation()

    if (location === undefined) {
      throw new Error(
        `[renoun] Export cannot be statically analyzed at file path "${this.#file.getRelativePathToRoot()}".`
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
    const path = this.#file.getAbsolutePath()

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

  /** Get the resolved type of the export. */
  async getType(filter?: TypeFilter) {
    const location = await this.#getLocation()

    if (location === undefined) {
      throw new Error(
        `[renoun] Export cannot not be statically analyzed at file path "${this.#file.getRelativePathToRoot()}".`
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
        `[renoun] Export cannot be statically analyzed at file path "${this.#file.getRelativePathToRoot()}".`
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
        `[renoun] Export cannot be statically analyzed at file path "${this.#file.getRelativePathToRoot()}".`
      )
    }

    return this.#file.parseExportValue(this.#name, staticValue)
  }

  #getModule() {
    if (this.#loader === undefined) {
      const parentPath = this.#file.getParent().getRelativePathToWorkspace()

      throw new Error(
        `[renoun] A loader for the parent Directory at ${parentPath} is not defined.`
      )
    }

    const path = removeExtension(this.#file.getRelativePathToRoot())

    if (isLoader(this.#loader)) {
      return unwrapModuleResult<any>(this.#loader(path, this.#file))
    }

    if (isLoaderWithSchema(this.#loader) && this.#loader.runtime) {
      return unwrapModuleResult<any>(this.#loader.runtime(path, this.#file))
    }

    const parentPath = this.#file.getParent().getRelativePathToWorkspace()

    throw new Error(
      `[renoun] A runtime loader for the parent Directory at ${parentPath} is not defined.`
    )
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
        `[renoun] JavaScript file export "${this.#name}" not found in ${this.#file.getAbsolutePath()}`
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
      `[renoun] JavaScript file export "${this.#name}" could not be determined statically or at runtime for path "${this.#file.getAbsolutePath()}". Ensure the directory has a loader defined for resolving "${this.#file.getExtension()}" files.`
    )
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
  Types extends InferDefaultModuleTypes<Path>,
  DirectoryTypes extends Record<string, any> = Record<string, any>,
  const Path extends string = string,
  Extension extends string = ExtractFileExtension<Path>,
> extends File<DirectoryTypes, Path, Extension> {
  #exports = new Map<string, JavaScriptModuleExport<any>>()
  #loader?: ModuleLoader<Types>
  #slugCasing?: SlugCasing
  #modulePromise?: Promise<any>
  #headings?: Headings

  constructor({
    loader,
    ...fileOptions
  }: JavaScriptFileOptions<Types, DirectoryTypes, Path>) {
    super(fileOptions)

    if (loader === undefined) {
      const extension = this.getExtension()

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
      const parentPath = this.getParent().getRelativePathToRoot()

      throw new Error(
        `[renoun] A loader for the parent Directory at ${parentPath} is not defined.`
      )
    }

    const path = removeExtension(this.getRelativePathToRoot())
    const loader = this.#loader
    let executeModuleLoader: () => Promise<any>

    if (isLoader(loader)) {
      executeModuleLoader = () => unwrapModuleResult(loader(path, this))
    } else if (isLoaderWithSchema(loader)) {
      if (!loader.runtime) {
        const parentPath = this.getParent().getRelativePathToWorkspace()

        throw new Error(
          `[renoun] A runtime loader for the parent Directory at ${parentPath} is not defined.`
        )
      }
      executeModuleLoader = () =>
        unwrapModuleResult((loader.runtime as any)(path, this))
    } else {
      throw new Error(
        `[renoun] This loader is missing a runtime for the parent Directory at ${this.getParent().getRelativePathToWorkspace()}.`
      )
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
    const extension = this.getExtension()

    if (!extension || !this.#loader) {
      return value
    }

    if (isLoaderWithSchema(this.#loader)) {
      let parseValue = (this.#loader as ModuleLoaderWithSchema<any>).schema[
        name
      ]

      if (parseValue) {
        try {
          if ('~standard' in parseValue) {
            const result = parseValue['~standard'].validate(
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

              throw new Error(
                `[renoun] Schema validation failed for export "${name}" at file path: "${this.getAbsolutePath()}"\n\nThe following issues need to be fixed:\n${issuesMessage}`
              )
            }

            value = result.value
          } else {
            value = parseValue(value)
          }
        } catch (error) {
          if (error instanceof Error) {
            throw new Error(
              `[renoun] Schema validation failed to parse export "${name}" at file path: "${this.getAbsolutePath()}"\n\nThe following error occurred:\n${error.message}`
            )
          }
        }
      }
    }

    return value
  }

  /** Get all export names and positions from the JavaScript file. */
  async #getExports() {
    const fileSystem = this.getParent().getFileSystem()
    return fileSystem.getFileExports(this.getAbsolutePath())
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
  async getExport<ExportName extends Extract<keyof Types, string>>(
    name: ExportName
  ): Promise<JavaScriptModuleExport<Types[ExportName]>> {
    if (await this.hasExport(name)) {
      if (this.#exports.has(name)) {
        return this.#exports.get(name)!
      }

      const fileExport = await JavaScriptModuleExport.init<Types[ExportName]>(
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
        `[renoun] JavaScript file export "${name}" could not be determined statically or at runtime for path "${this.getAbsolutePath()}". Ensure the directory has a loader defined for resolving "${this.getExtension()}" files.`
      )
    }

    throw new ModuleExportNotFoundError(
      this.getAbsolutePath(),
      name,
      'JavaScript'
    )
  }

  /** Get a named export from the JavaScript file. */
  async getNamedExport<ExportName extends Extract<keyof Types, string>>(
    name: ExportName
  ): Promise<JavaScriptModuleExport<Types[ExportName]>> {
    return this.getExport(name)
  }

  /** Get the default export from the JavaScript file. */
  async getDefaultExport(
    this: Types extends { default: infer _DefaultType }
      ? JavaScriptFile<Types, DirectoryTypes, Path, Extension>
      : never
  ): Promise<
    JavaScriptModuleExport<
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
  async getExportValue<ExportName extends Extract<keyof Types, string>>(
    name: ExportName
  ): Promise<Types[ExportName]>
  async getExportValue(name: string): Promise<any> {
    const fileExport = await this.getExport(name as any)
    return (await fileExport.getValue()) as any
  }

  /** Get headings derived from the file exports. */
  async getHeadings(): Promise<Headings> {
    if (!this.#headings) {
      // Fast path: try to derive headings from a quick static scan of the source
      // text without initializing any TypeScript project or reading symbol
      // metadata. This is sufficient for simple cases and avoids the overhead of
      // creating a TypeScript project
      const fastNames = await this.#getFastExportNames()
      if (fastNames && fastNames.length > 0) {
        this.#headings = fastNames.map((name) => ({
          id: name,
          level: 3,
          children: name,
          text: name,
        }))
      } else {
        // Fallback to the full export analysis
        const fileExports = await this.getExports()
        this.#headings = fileExports.map((fileExport) => {
          const name = fileExport.getName()
          return {
            id: name,
            level: 3,
            children: name,
            text: name,
          }
        })
      }
    }

    return this.#headings
  }

  /**
   * Attempt to quickly extract named export identifiers from the file source
   * using lightweight regexes. This intentionally handles the most common
   * patterns:
   *   - export const Name = …
   *   - export function Name(…
   *   - export class Name …
   *   - export { A, B as C }  (captures A and C)
   * It skips default exports on purpose since those are not used for headings.
   */
  async #getFastExportNames(): Promise<string[] | undefined> {
    try {
      const source = await this.getText()
      // If the file contains any explicit re-exports, skip the fast path and
      // defer to the full TypeScript analysis which can follow the graph.
      const hasReExports =
        /\bexport\s*\*\s*(?:as\s+[A-Za-z_\$][\w\$]*)?\s*from\s*['"][^'"]+['"]/.test(
          source
        ) || /\bexport\s*\{[^}]+\}\s*from\s*['"][^'"]+['"]/.test(source)
      if (hasReExports) {
        return undefined
      }
      const names = new Set<string>()

      // export const Name = …
      // export let Name = …
      // export var Name = …
      const varRegex = /\bexport\s+(?:const|let|var)\s+([A-Za-z_\$][\w\$]*)\b/g
      for (let m; (m = varRegex.exec(source)); ) {
        names.add(m[1])
      }

      // export function Name(…
      const fnRegex = /\bexport\s+function\s+([A-Za-z_\$][\w\$]*)\s*\(/g
      for (let m; (m = fnRegex.exec(source)); ) {
        names.add(m[1])
      }

      // export class Name …
      const classRegex = /\bexport\s+class\s+([A-Za-z_\$][\w\$]*)\b/g
      for (let m; (m = classRegex.exec(source)); ) {
        names.add(m[1])
      }

      // export { A, B as C }
      const namedListRegex = /\bexport\s*\{\s*([^}]+)\s*\}/g
      for (let m; (m = namedListRegex.exec(source)); ) {
        const list = m[1]
        for (const part of list.split(',')) {
          const piece = part.trim()
          if (!piece) continue
          // Handle "B as C" aliasing
          const aliasMatch = piece.match(
            /^([A-Za-z_\$][\w\$]*)\s+as\s+([A-Za-z_\$][\w\$]*)$/
          )
          if (aliasMatch) {
            names.add(aliasMatch[2])
          } else {
            const ident = piece.match(/^([A-Za-z_\$][\w\$]*)$/)
            if (ident) {
              names.add(ident[1])
            }
          }
        }
      }

      if (names.size > 0) {
        return Array.from(names)
      }
    } catch {
      // Ignore and fall back to the full analysis path
    }
    return undefined
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
  #slugCasing: SlugCasing
  #staticPromise?: Promise<Value>
  #runtimePromise?: Promise<Value>

  constructor(
    name: string,
    file: MDXFile<any>,
    loader?: ModuleLoader<any>,
    slugCasing?: SlugCasing
  ) {
    this.#name = name
    this.#file = file
    this.#loader = loader
    this.#slugCasing = slugCasing ?? 'kebab'
  }

  getName() {
    return this.#name
  }

  getTitle() {
    return formatNameAsTitle(this.getName())
  }

  getSlug() {
    return createSlug(this.getName(), this.#slugCasing)
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
    const extension = 'mdx'

    if (!extension || !this.#loader) {
      return value
    }

    if (isLoaderWithSchema(this.#loader)) {
      let parseValue = (this.#loader as ModuleLoaderWithSchema<any>).schema[
        name
      ]

      if (parseValue) {
        try {
          if ('~standard' in parseValue) {
            const result = parseValue['~standard'].validate(
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

              throw new Error(
                `[renoun] Schema validation failed for export "${name}" at file path: "${this.#file.getAbsolutePath()}"\n\nThe following issues need to be fixed:\n${issuesMessage}`
              )
            }

            value = result.value
          } else {
            value = parseValue(value)
          }
        } catch (error) {
          if (error instanceof Error) {
            throw new Error(
              `[renoun] Schema validation failed to parse export "${name}" at file path: "${this.#file.getAbsolutePath()}"\n\nThe following error occurred:\n${error.message}`
            )
          }
        }
      }
    }

    return value
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
        `[renoun] Export cannot be statically analyzed at file path "${this.#file.getRelativePathToRoot()}".`
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
      throw new Error(
        `[renoun] MDX file export "${String(this.#name)}" does not have a runtime value.`
      )
    }

    const fileModuleExport = fileModule[this.#name]

    if (fileModuleExport === undefined) {
      throw new Error(
        `[renoun] MDX file export "${this.#name}" not found in ${this.#file.getAbsolutePath()}`
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
    if (this.#loader === undefined) {
      const parentPath = this.#file.getParent().getRelativePathToWorkspace()

      throw new Error(
        `[renoun] An mdx loader for the parent Directory at ${parentPath} is not defined.`
      )
    }

    const path = removeExtension(this.#file.getRelativePathToRoot())

    if (isLoader(this.#loader)) {
      return unwrapModuleResult<any>(this.#loader(path, this.#file))
    }

    if (isLoaderWithSchema(this.#loader) && this.#loader.runtime) {
      return unwrapModuleResult<any>(this.#loader.runtime(path, this.#file))
    }

    const parentPath = this.#file.getParent().getRelativePathToWorkspace()

    throw new Error(
      `[renoun] An mdx runtime loader for the parent Directory at ${parentPath} is not defined.`
    )
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
  #headings?: Headings
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
      this.#rawSource = super.getText()
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

  override async getText(): Promise<string> {
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

  async getExports() {
    const fileModule = await this.#getModule()
    const exportNames = Object.keys(fileModule)

    for (const name of exportNames) {
      if (!this.#exports.has(name)) {
        const mdxExport = new MDXModuleExport(
          name,
          this as MDXFile<any>,
          this.#loader,
          this.#slugCasing
        )
        this.#exports.set(name, mdxExport)
      }
    }

    return Array.from(this.#exports.values())
  }

  async getExport<ExportName extends 'default' | Extract<keyof Types, string>>(
    name: ExportName
  ): Promise<MDXModuleExport<({ default: MDXContent } & Types)[ExportName]>> {
    if (this.#exports.has(name)) {
      return this.#exports.get(name)!
    }

    const fileModule = await this.#getModule()

    if (!(name in fileModule)) {
      throw new ModuleExportNotFoundError(this.getAbsolutePath(), name, 'MDX')
    }

    const fileExport = new MDXModuleExport<
      ({ default: MDXContent } & Types)[ExportName]
    >(name, this as MDXFile<any>, this.#loader, this.#slugCasing)

    this.#exports.set(name, fileExport)

    return fileExport
  }

  /** Get a named export from the MDX file. */
  async getNamedExport<ExportName extends Extract<keyof Types, string>>(
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

  /** Get headings parsed from the MDX content. */
  async getHeadings(): Promise<Headings> {
    if (!this.#headings) {
      try {
        this.#headings = await this.getExport('headings' as any).then(
          (fileExport) => fileExport.getValue()
        )
      } catch (error) {
        if (!(error instanceof ModuleExportNotFoundError)) {
          throw error
        }
      }

      if (!this.#headings) {
        const source = await this.getText()
        this.#headings = getMDXHeadings(source)
      }
    }

    return this.#headings
  }

  /** Check if an export exists at runtime in the MDX file. */
  async hasExport(name: string): Promise<boolean> {
    const fileModule = await this.#getModule()
    return name in fileModule
  }

  /** Get the runtime value of an export in the MDX file. */
  async getExportValue<
    ExportName extends 'default' | Extract<keyof Types, string>,
  >(name: ExportName): Promise<({ default: MDXContent } & Types)[ExportName]>
  async getExportValue(name: string): Promise<any> {
    const fileExport = await this.getExport(name as any)
    return (await fileExport.getValue()) as any
  }

  async #getStaticExportValues() {
    if (!this.#staticExportValues) {
      const source = await this.getText()
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
      const parentPath = this.getParent().getRelativePathToRoot()

      throw new Error(
        `[renoun] An mdx loader for the parent Directory at ${parentPath} is not defined.`
      )
    }

    const path = removeExtension(this.getRelativePathToRoot())
    const loader = this.#loader
    let executeModuleLoader: () => Promise<any>

    if (isLoader(loader)) {
      executeModuleLoader = () => unwrapModuleResult(loader(path, this))
    } else if (isLoaderWithSchema(loader)) {
      if (!loader.runtime) {
        const parentPath = this.getParent().getRelativePathToWorkspace()

        throw new Error(
          `[renoun] An mdx runtime loader for the parent Directory at ${parentPath} is not defined.`
        )
      }

      executeModuleLoader = () => (loader.runtime as any)(path, this)
    } else {
      throw new Error(
        `[renoun] This loader is missing an mdx runtime for the parent Directory at ${this.getParent().getRelativePathToWorkspace()}.`
      )
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
}

/** Options for a Markdown file in the file system. */
export interface MarkdownFileOptions<
  Types extends Record<string, any>,
  DirectoryTypes extends Record<string, any>,
  Path extends string,
> extends FileOptions<DirectoryTypes, Path> {
  loader?: ModuleLoader<{ default: MDXContent } & Types>
}

/** A Markdown file in the file system. */
export class MarkdownFile<
  Types extends Record<string, any> = { default: MDXContent },
  DirectoryTypes extends Record<string, any> = Record<string, any>,
  const Path extends string = string,
  Extension extends string = ExtractFileExtension<Path>,
> extends File<DirectoryTypes, Path, Extension> {
  #loader: ModuleLoader<{ default: MDXContent } & Types>
  #headings?: Headings
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
    Path
  >) {
    super(fileOptions)
    this.#loader = loader ?? defaultLoaders.md
  }

  async #getRawSource() {
    if (!this.#rawSource) {
      this.#rawSource = super.getText()
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

  override async getText(): Promise<string> {
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

  #getModule() {
    const path = removeExtension(this.getRelativePathToRoot())
    const loader = this.#loader
    let executeModuleLoader: () => Promise<any>

    if (isLoader(loader)) {
      executeModuleLoader = () => {
        return unwrapModuleResult(loader(path, this))
      }
    } else if (isLoaderWithSchema(loader)) {
      if (!loader.runtime) {
        const parentPath = this.getParent().getRelativePathToWorkspace()
        throw new Error(
          `[renoun] A markdown runtime loader for the parent Directory at ${parentPath} is not defined.`
        )
      }
      executeModuleLoader = () => {
        return unwrapModuleResult((loader.runtime as any)(path, this))
      }
    } else {
      throw new Error(
        `[renoun] This loader is missing a markdown runtime for the parent Directory at ${this.getParent().getRelativePathToWorkspace()}.`
      )
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

  /** Get headings parsed from the markdown content. */
  async getHeadings(): Promise<Headings> {
    if (!this.#headings) {
      const source = await this.getText()
      this.#headings = getMarkdownHeadings(source)
    }
    return this.#headings
  }

  /** Get the runtime value of an export in the Markdown file. (Permissive signature for union compatibility.) */
  async getExportValue<
    ExportName extends 'default' | Extract<keyof Types, string>,
  >(name: ExportName): Promise<({ default: MDXContent } & Types)[ExportName]>
  async getExportValue(name: string): Promise<any> {
    const fileModule = await this.#getModule()
    if (!(name in fileModule)) {
      throw new ModuleExportNotFoundError(
        this.getAbsolutePath(),
        name as any,
        'Markdown'
      )
    }
    return fileModule[name]
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

export type DirectoryFilter<
  Entry extends FileSystemEntry<any>,
  Types extends Record<string, any>,
> =
  | ((entry: FileSystemEntry<Types>) => entry is Entry)
  | ((entry: FileSystemEntry<Types>) => Promise<boolean> | boolean)
  | string

export interface DirectoryOptions<
  Types extends InferModuleLoadersTypes<Loaders> = any,
  LoaderTypes extends Types = any,
  Loaders extends ModuleLoaders = ModuleLoaders,
  Filter extends DirectoryFilter<
    FileSystemEntry<LoaderTypes>,
    LoaderTypes
  > = DirectoryFilter<FileSystemEntry<LoaderTypes>, LoaderTypes>,
> {
  /** Directory path in the workspace. */
  path?: PathLike

  /** Filter entries with a minimatch pattern or predicate. */
  filter?: Filter

  /** Extension loaders with or without `withSchema`. */
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
  sort?: SortDescriptor<ResolveDirectoryFilterEntries<Filter, LoaderTypes>>

  /** The repository used to generate source URLs. */
  repository?: Repository | RepositoryConfig | string
}

const enum DirectorySnapshotOptionBit {
  Recursive = 1 << 0,
  IncludeDirectoryNamedFiles = 1 << 1,
  IncludeIndexAndReadmeFiles = 1 << 2,
  IncludeGitIgnoredFiles = 1 << 3,
  IncludeTsConfigExcludedFiles = 1 << 4,
}

interface NormalizedDirectoryEntriesOptions {
  recursive: boolean
  includeDirectoryNamedFiles: boolean
  includeIndexAndReadmeFiles: boolean
  includeGitIgnoredFiles: boolean
  includeTsConfigExcludedFiles: boolean
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
  snapshot: DirectorySnapshot<LoaderTypes>
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

  return mask
}

/** A directory containing files and subdirectories in the file system. */
export class Directory<
  Types extends InferModuleLoadersTypes<Loaders>,
  LoaderTypes extends WithDefaultTypes<Types> = WithDefaultTypes<Types>,
  Loaders extends ModuleLoaders = ModuleLoaders,
  Filter extends DirectoryFilter<
    FileSystemEntry<LoaderTypes>,
    LoaderTypes
  > = DirectoryFilter<FileSystemEntry<LoaderTypes>, LoaderTypes>,
> {
  #path: string
  #rootPath?: string
  #basePathname?: string | null
  #tsConfigPath?: string
  #slugCasing: SlugCasing
  #loader?: Loaders | (() => Loaders)
  #resolvedLoaders?: Loaders
  #directory?: Directory<any, any, any>
  #fileSystem: FileSystem | undefined
  #repository: Repository | undefined
  #repositoryOption?: Repository | RepositoryConfig | string
  #filterPattern?: string
  #filter?:
    | ((
        entry: FileSystemEntry<LoaderTypes>
      ) => entry is FileSystemEntry<LoaderTypes>)
    | ((entry: FileSystemEntry<LoaderTypes>) => Promise<boolean> | boolean)
    | Minimatch
  #filterCache?: WeakMap<FileSystemEntry<LoaderTypes>, boolean>
  #simpleFilter?: { recursive: boolean; extensions: Set<string> }
  #sort?: any

  constructor(options?: DirectoryOptions<Types, LoaderTypes, Loaders, Filter>) {
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
      this.#loader = options.loader
      this.#basePathname =
        options.basePathname === undefined
          ? this.#directory
            ? this.#directory.getSlug()
            : this.getSlug()
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
              return extensions.has(entry.getExtension())
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

      return this.#filter.match(entry.getRelativePathToRoot())
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
      const extension = entry.getExtension()

      if (extension === 'ts' || extension === 'tsx') {
        const fileSystem = entry.getParent().getFileSystem()
        if (!fileSystem.shouldStripInternal()) {
          return true
        }
        const allExports = await fileSystem.getFileExports(
          entry.getAbsolutePath()
        )
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
  #duplicate(options?: DirectoryOptions<any, any, any>) {
    const directory = new Directory<
      LoaderTypes,
      LoaderTypes,
      Loaders,
      DirectoryFilter<FileSystemEntry<LoaderTypes>, LoaderTypes>
    >({
      path: this.#path,
      fileSystem: this.#fileSystem,
      basePathname: this.#basePathname,
      tsConfigPath: this.#tsConfigPath,
      slugCasing: this.#slugCasing,
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

    return directory
  }

  /** Resolve the loaders map when a factory is provided and cache the result. */
  #getLoaders(): Loaders | undefined {
    if (!this.#loader) {
      return undefined
    }
    if (typeof this.#loader === 'function') {
      if (!this.#resolvedLoaders) {
        this.#resolvedLoaders = (this.#loader as () => Loaders)()
      }
      return this.#resolvedLoaders
    }
    return this.#loader as Loaders
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
  getDepth() {
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
          directory,
          basePathname: directory.#basePathname,
          slugCasing: directory.#slugCasing,
        } as const
        const extension = extensionName(entry.name).slice(1)
        const loaders = directory.#getLoaders()
        const loader = loaders?.[extension] as
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
      const directoryWorkspacePath = directory
        .getRelativePathToWorkspace()
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
            if (allExtensions && !allExtensions.includes(hit.getExtension())) {
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
            if (allExtensions && !allExtensions.includes(hit.getExtension())) {
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
        const baseSlug = createSlug(entry.getBaseName(), this.#slugCasing)
        if (baseSlug !== currentSegment) continue
        // If extensions were specified, only consider matching files.
        if (allExtensions && !allExtensions.includes(entry.getExtension())) {
          continue
        }
        // Prefer files without modifiers over files with modifiers.
        if (!entry.getModifierName()) {
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
      const baseSlug = createSlug(entry.getBaseName(), this.#slugCasing)

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

      const modifier = entry.getModifierName()
      const matchesExtension = allExtensions
        ? allExtensions.includes(entry.getExtension())
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
        if (
          !fallback ||
          (fallback instanceof File && fallback.getModifierName())
        ) {
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
      directoryPath: directory.getRelativePathToWorkspace(),
      rootPath: directory.getRootPath(),
      nearestCandidates: entries.map((entry) => entry.getBaseName()),
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
        ? JavaScriptFile<LoaderTypes[Extension], LoaderTypes, string, Extension>
        : Extension extends 'mdx'
          ? MDXFile<LoaderTypes['mdx'], LoaderTypes, string, Extension>
          : Extension extends 'md'
            ? MarkdownFile<LoaderTypes['md'], LoaderTypes, string, Extension>
            : Extension extends 'json'
              ? JSONFile<
                  JSONExtensionType<LoaderTypes>,
                  LoaderTypes,
                  string,
                  Extension
                >
              : File<LoaderTypes, Path, Extension>
      : File<LoaderTypes>
  >

  async getFile<
    ExtensionType extends keyof LoaderTypes | string,
    const Extension extends ExtensionType | Extension[],
  >(
    path: string | string[],
    extension?: Extension | Extension[]
  ): Promise<
    Extension extends string
      ? IsJavaScriptLikeExtension<Extension> extends true
        ? JavaScriptFile<LoaderTypes[Extension], LoaderTypes, string, Extension>
        : Extension extends 'mdx'
          ? MDXFile<LoaderTypes['mdx'], LoaderTypes, string, Extension>
          : Extension extends 'md'
            ? MarkdownFile<LoaderTypes['md'], LoaderTypes, string, Extension>
            : Extension extends 'json'
              ? JSONFile<
                  JSONExtensionType<LoaderTypes>,
                  LoaderTypes,
                  string,
                  Extension
                >
              : File<LoaderTypes, Extension>
      : File<LoaderTypes>
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
          ? extension.includes(cachedFile.getExtension())
          : extension === cachedFile.getExtension()))
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
        directoryPath: this.getRelativePathToWorkspace(),
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

        const baseName = directoryEntry.getBaseName()
        const extension = directoryEntry.getExtension()
        const hasValidExtension = allExtensions
          ? allExtensions.includes(extension)
          : true

        // Check for file that shares the directory name
        if (baseName === entry.getBaseName() && hasValidExtension) {
          if (!directoryEntry.getModifierName()) {
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
          directoryPath: entry.getRelativePathToWorkspace(),
          rootPath: entry.getRootPath(),
          nearestCandidates: directoryEntries.map((entry) =>
            entry.getBaseName()
          ),
        })
      }
    }

    if (entry instanceof File) {
      return entry as any
    }

    throw new FileNotFoundError(rawPath, allExtensions, {
      directoryPath: this.getRelativePathToWorkspace(),
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
        const baseSegment = createSlug(
          currentEntry.getBaseName(),
          this.#slugCasing
        )

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
          directoryPath: this.getRelativePathToWorkspace(),
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
      const directoryBaseName = directory.getBaseName()
      let sameNamedSibling: File<LoaderTypes> | undefined

      try {
        const parentDirectory = directory.getParent()
        try {
          const sibling = await parentDirectory.getFile(directoryBaseName)
          if (
            sibling instanceof File &&
            sibling.getBaseName() === directoryBaseName
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
        const entryBaseName = entry.getBaseName()
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

  #snapshotCache = new Map<number, DirectorySnapshot<LoaderTypes>>()
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
    const workspacePath = entry.getRelativePathToWorkspace()
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
  async getEntries(options?: {
    /** Recursively walk every subdirectory. */
    recursive?: Filter extends string
      ? Filter extends `**${string}`
        ? boolean
        : undefined
      : boolean

    /** Include files named the same as their immediate directory (e.g. `Button/Button.tsx`). */
    includeDirectoryNamedFiles?: boolean

    /** Include index and readme files. */
    includeIndexAndReadmeFiles?: boolean

    /** Include files that are ignored by `.gitignore`. */
    includeGitIgnoredFiles?: boolean

    /** Include files that are excluded by the configured `tsconfig.json` file's `exclude` patterns. */
    includeTsConfigExcludedFiles?: boolean
  }): Promise<
    Array<
      Filter extends string
        ? Filter extends `**${string}`
          ?
              | Directory<LoaderTypes>
              | FileWithExtension<LoaderTypes, ExtractFileExtension<Filter>>
          : FileWithExtension<LoaderTypes, ExtractFileExtension<Filter>>
        : Filter extends DirectoryFilter<infer FilteredEntry, LoaderTypes>
          ? FilteredEntry
          : FileSystemEntry<LoaderTypes>
    >
  > {
    if (options?.recursive && this.#filterPattern) {
      if (!this.#filterPattern.includes('**')) {
        const lines: string[] = [
          `[renoun] Cannot use recursive option with a shallow filter pattern.`,
          `Method: Directory#getEntries`,
          `Directory path: "${this.#path}"`,
          `Filter pattern: "${this.#filterPattern}"`,
          `Hint: Use a recursive pattern (e.g. "**/*.mdx") when "recursive" is enabled.`,
        ]
        if (this.#rootPath) {
          lines.push(`Directory root: "${this.#rootPath}"`)
        }
        throw new Error(lines.join('\n'))
      }
    }

    const normalized = this.#normalizeEntriesOptions(options)
    const mask = createOptionsMask(normalized)

    const cachedSnapshot = this.#snapshotCache.get(mask)
    if (cachedSnapshot) {
      if (process.env.NODE_ENV === 'development') {
        const isStale = await this.#isSnapshotStale(cachedSnapshot)
        if (!isStale) {
          return cachedSnapshot.materialize() as any
        }
        this.#snapshotCache.delete(mask)
      } else {
        return cachedSnapshot.materialize() as any
      }
    }

    const snapshot = await this.#hydrateDirectorySnapshot(
      this,
      normalized,
      mask
    )

    return snapshot.materialize() as any
  }

  #normalizeEntriesOptions(options?: {
    recursive?: boolean
    includeDirectoryNamedFiles?: boolean
    includeIndexAndReadmeFiles?: boolean
    includeGitIgnoredFiles?: boolean
    includeTsConfigExcludedFiles?: boolean
  }): NormalizedDirectoryEntriesOptions {
    return {
      recursive: options?.recursive ?? false,
      includeDirectoryNamedFiles: options?.includeDirectoryNamedFiles ?? false,
      includeIndexAndReadmeFiles: options?.includeIndexAndReadmeFiles ?? false,
      includeGitIgnoredFiles: options?.includeGitIgnoredFiles ?? false,
      includeTsConfigExcludedFiles:
        options?.includeTsConfigExcludedFiles ?? false,
    }
  }

  async #hydrateDirectorySnapshot(
    directory: Directory<LoaderTypes>,
    options: NormalizedDirectoryEntriesOptions,
    mask: number
  ): Promise<DirectorySnapshot<LoaderTypes>> {
    const { snapshot } = await this.#buildSnapshot(directory, options, mask)
    return snapshot
  }

  async #isSnapshotStale(
    snapshot: DirectorySnapshot<LoaderTypes>
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
    snapshot: DirectorySnapshot<LoaderTypes>
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
      DirectorySnapshotDirectoryMetadata<LoaderTypes>
    >()

    for (const entry of rawEntries) {
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
        directory,
        basePathname: directory.#basePathname,
        slugCasing: directory.#slugCasing,
      } as const

      const extension = extensionName(entry.name).slice(1)
      const loaders = directory.#getLoaders()
      const loader = loaders?.[extension] as
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
        removeAllExtensions(entry.name) === directory.getBaseName()

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
        const directoryBaseName = directoryEntry.getBaseName()
        for (const childEntry of childrenEntries) {
          const isDirectoryNamedFile =
            childEntry instanceof File &&
            childEntry.getParent() === directoryEntry &&
            childEntry.getBaseName() === directoryBaseName &&
            !options.includeDirectoryNamedFiles

          if (!isDirectoryNamedFile) {
            entriesResult.push(childEntry)
          }
        }
      }
    }

    const snapshot = createDirectorySnapshot<LoaderTypes>({
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
  getSlug() {
    return createSlug(this.getBaseName(), this.#slugCasing)
  }

  /** Get the base name of this directory. */
  getName() {
    return this.getBaseName()
  }

  /** Get the base name of this directory. */
  getBaseName() {
    return removeOrderPrefixes(baseName(this.#path))
  }

  /** The directory name formatted as a title. */
  getTitle() {
    return formatNameAsTitle(this.getName())
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

  /** Get the relative path of this directory to the root directory. */
  getRelativePathToRoot() {
    const rootPath = this.getRootPath()
    return rootPath ? relativePath(rootPath, this.#path) : this.#path
  }

  /** Get the relative path of the directory to the workspace. */
  getRelativePathToWorkspace() {
    return this.getFileSystem().getRelativePathToWorkspace(this.#path)
  }

  /** Get the absolute path of this directory. */
  getAbsolutePath() {
    return this.getFileSystem().getAbsolutePath(this.#path)
  }

  /** Get a URL to the directory for the configured git repository. */
  #getRepositoryUrl(
    repository?: RepositoryConfig | string | Repository,
    options?: Omit<GetDirectoryUrlOptions, 'path'>
  ) {
    return this.getRepository(repository).getDirectoryUrl({
      path: this.getRelativePathToWorkspace(),
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
      path: this.getAbsolutePath(),
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
          if (entry.getExtension() === fileExtension) {
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
    Entries[number] extends Directory<any, any, infer Loaders> ? Loaders : {}
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
        const lowerCaseBaseName = entry.getBaseName().toLowerCase()
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
      const baseName = entry.getBaseName()
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
  async getFile<const Extension extends string | undefined = undefined>(
    /** The path to the entry excluding leading numbers and the extension. */
    path: string | string[],

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
      : File<Types>
  > {
    const normalizedPath = Array.isArray(path)
      ? path.map(normalizeSlashes)
      : normalizeSlashes(path).split('/').filter(Boolean)
    const rootPath = normalizedPath.at(0)

    for (const entry of this.#entries) {
      const baseName = entry.getBaseName()
      const isRootDirectory = baseName === '.'

      if (isRootDirectory || baseName === rootPath) {
        if (entry instanceof Directory) {
          const directoryFile = await entry
            .getFile(
              isRootDirectory ? normalizedPath : normalizedPath.slice(1),
              extension
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

            if (fileExtensions.includes(entry.getExtension() as Extension)) {
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
      const baseName = entry.getBaseName()
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
    const fileExtension = entry.getExtension()

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

type ExtensionPropertyPaths<ExtensionTypes> = {
  [Extension in keyof ExtensionTypes & string]: NestedPropertyPath<
    ExtensionTypes[Extension]
  >
}[keyof ExtensionTypes & string]

type BuiltinProperty = 'name' | 'directory'

type ValidSortKey<ExtensionTypes> =
  LoadersWithRuntimeKeys<ExtensionTypes> extends never
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
  return entry.getBaseName().toLowerCase()
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
