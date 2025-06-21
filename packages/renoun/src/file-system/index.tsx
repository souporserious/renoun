import * as React from 'react'
import type { MDXContent } from '@renoun/mdx'
import { rehypePlugins, remarkPlugins } from '@renoun/mdx'
import { Minimatch } from 'minimatch'

import { CodeBlock, parsePreProps } from '../components/CodeBlock/index.js'
import { CodeInline, parseCodeProps } from '../components/CodeInline.js'
import type { MDXComponents } from '../mdx/index.js'
import { getFileExportMetadata } from '../project/client.js'
import { createSlug, type SlugCasings } from '../utils/create-slug.js'
import { formatNameAsTitle } from '../utils/format-name-as-title.js'
import { getEditorUri } from '../utils/get-editor-uri.js'
import type { FileExport } from '../utils/get-file-exports.js'
import { getLocalGitFileMetadata } from '../utils/get-local-git-file-metadata.js'
import { getMDXRuntimeValue } from '../utils/get-mdx-runtime-value.js'
import {
  isJavaScriptLikeExtension,
  type IsJavaScriptLikeExtension,
  type HasJavaScriptLikeExtensions,
} from '../utils/is-javascript-like-extension.js'
import { loadConfig } from '../utils/load-config.js'
import {
  baseName,
  ensureRelativePath,
  extensionName,
  joinPaths,
  removeExtension,
  removeAllExtensions,
  removeOrderPrefixes,
  relativePath,
} from '../utils/path.js'
import type { SymbolFilter } from '../utils/resolve-type.js'
import type { FileSystem } from './FileSystem.js'
import { NodeFileSystem } from './NodeFileSystem.js'
import {
  Repository,
  type GetFileUrlOptions,
  type GetDirectoryUrlOptions,
} from './Repository.js'
import type { StandardSchemaV1 } from './standard-schema.js'
import type { ExtractFileExtension, IsNever } from './types.js'

export { FileSystem } from './FileSystem.js'
export { MemoryFileSystem } from './MemoryFileSystem.js'
export { NodeFileSystem } from './NodeFileSystem.js'
export { Repository } from './Repository.js'

const mdxComponents = {
  pre: (props) => <CodeBlock {...parsePreProps(props)} />,
  code: (props) => <CodeInline {...parseCodeProps(props)} />,
} satisfies MDXComponents

const defaultLoaders: Record<string, ModuleLoader<any>> = {
  mdx: async (_, file) => {
    const value = await file.getText()
    const { default: Content, ...mdxExports } = await getMDXRuntimeValue({
      value,
      remarkPlugins,
      rehypePlugins,
    })
    return {
      default: () => <Content components={mdxComponents} />,
      ...mdxExports,
    }
  },
} satisfies Record<string, ModuleRuntimeLoader<any>>

/** A function that resolves the module runtime. */
type ModuleRuntimeLoader<Value> = (
  path: string,
  file: File<any> | JavaScriptFile<any> | MDXFile<any>
) => Promise<Value>

/** A record of named exports in a module. */
type ModuleExports<Value = any> = {
  [exportName: string]: Value
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
  runtime: ModuleRuntimeLoader<NoInfer<Types>>
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

/** Default module types for common file extensions. */
export interface DefaultModuleTypes {
  mdx: {
    default: MDXContent
  }
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
  'js' | 'jsx' | 'ts' | 'tsx' | 'mdx'
>

/** All export names made available by a set of runtime‑capable loaders. */
export type LoaderExportNames<Loaders> = string &
  {
    [Extension in LoadersWithRuntimeKeys<Loaders>]: keyof Loaders[Extension]
  }[LoadersWithRuntimeKeys<Loaders>]

/** The value type for a given export name coming from any runtime‑capable loaders. */
export type LoaderExportValue<Loaders, Name extends string> = {
  [Extension in LoadersWithRuntimeKeys<Loaders>]: Name extends keyof Loaders[Extension]
    ? Loaders[Extension][Name]
    : never
}[LoadersWithRuntimeKeys<Loaders>]

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

/** Error for when a file is not found. */
export class FileNotFoundError extends Error {
  constructor(path: string | string[], extension?: any) {
    const normalizedPath = Array.isArray(path) ? joinPaths(...path) : path
    const normalizedExtension = extension
      ? Array.isArray(extension)
        ? extension
        : [extension]
      : []
    const extensionMessage = normalizedExtension.length
      ? ` with extension${normalizedExtension.length > 1 ? 's' : ''}: ${normalizedExtension.join(',')}`
      : ''
    super(
      `[renoun] File not found at path "${normalizedPath}"${extensionMessage}`
    )
    this.name = 'FileNotFoundError'
  }
}

/** A directory or file entry. */
export type FileSystemEntry<
  DirectoryTypes extends Record<string, any> = Record<string, any>,
> = Directory<DirectoryTypes> | File<DirectoryTypes>

/** Options for a file in the file system. */
export interface FileOptions<
  Types extends Record<string, any> = Record<string, any>,
  Path extends string = string,
> {
  path: Path
  basePathname?: string | null
  slugCasing?: SlugCasings
  depth?: number
  directory?: Directory<
    Types,
    WithDefaultTypes<Types>,
    ModuleLoaders,
    DirectoryInclude<FileSystemEntry<Types>, Types>
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
  #slugCasing: SlugCasings
  #directory: Directory<DirectoryTypes>

  constructor(options: FileOptions<DirectoryTypes, Path>) {
    this.#name = baseName(options.path)
    this.#path = options.path
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
  getPathname(options?: {
    includeBasePathname?: boolean
    includeDuplicateSegments?: boolean
  }) {
    const includeBasePathname = options?.includeBasePathname ?? true
    const includeDuplicateSegments = options?.includeDuplicateSegments ?? false
    const fileSystem = this.#directory.getFileSystem()
    let path = fileSystem.getPathname(this.#path, {
      basePath:
        includeBasePathname && this.#basePathname !== null
          ? this.#basePathname
          : undefined,
      rootPath: this.#directory.getRootPath(),
    })

    if (!includeDuplicateSegments || this.#slugCasing !== 'none') {
      let parsedPath = path.split('/')
      const parsedSegments: string[] = []

      for (let index = 0; index < parsedPath.length; index++) {
        const segment = parsedPath[index]

        if (includeDuplicateSegments || segment !== parsedPath[index - 1]) {
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
  getPathnameSegments(options?: {
    includeBasePathname?: boolean
    includeDuplicateSegments?: boolean
  }) {
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
    return fileSystem.getRelativePathToWorkspace(this.#path)
  }

  /** Get the absolute file system path. */
  getAbsolutePath() {
    const fileSystem = this.#directory.getFileSystem()
    return fileSystem.getAbsolutePath(this.#path)
  }

  /** Get a URL to the file for the configured remote git repository. */
  #getRepositoryUrl(options?: Omit<GetFileUrlOptions, 'path'>) {
    const repository = this.#directory.getRepository()
    const fileSystem = this.#directory.getFileSystem()

    return repository.getFileUrl({
      path: fileSystem.getRelativePathToWorkspace(this.#path),
      ...options,
    })
  }

  /** Get the URL to the file git blame for the configured git repository. */
  getBlameUrl(options?: Pick<GetFileUrlOptions, 'ref'>) {
    return this.#getRepositoryUrl({
      type: 'blame',
      ref: options?.ref,
    })
  }

  /** Get the edit URL to the file source for the configured git repository. */
  getEditUrl(options?: Pick<GetFileUrlOptions, 'ref' | 'line'>) {
    return this.#getRepositoryUrl({
      type: 'edit',
      ref: options?.ref,
      line: options?.line,
    })
  }

  /** Get the URL to the file history for the configured git repository. */
  getHistoryUrl(options?: Pick<GetFileUrlOptions, 'ref'>) {
    return this.#getRepositoryUrl({
      type: 'history',
      ref: options?.ref,
    })
  }

  /** Get the URL to the raw file contents for the configured git repository. */
  getRawUrl(options?: Pick<GetFileUrlOptions, 'ref'>) {
    return this.#getRepositoryUrl({
      type: 'raw',
      ref: options?.ref,
    })
  }

  /** Get the URL to the file source for the configured git repository. */
  getSourceUrl(options?: Pick<GetFileUrlOptions, 'ref' | 'line'>) {
    return this.#getRepositoryUrl({
      type: 'source',
      ref: options?.ref,
      line: options?.line,
    })
  }

  /** Get the URI to the file source code for the configured editor. */
  getEditorUri() {
    return getEditorUri({ path: this.getAbsolutePath() })
  }

  /** Get the first local git commit date of the file. */
  async getFirstCommitDate() {
    const gitMetadata = await getLocalGitFileMetadata(this.#path)
    return gitMetadata.firstCommitDate
  }

  /** Get the last local git commit date of the file. */
  async getLastCommitDate() {
    const gitMetadata = await getLocalGitFileMetadata(this.#path)
    return gitMetadata.lastCommitDate
  }

  /** Get the local git authors of the file. */
  async getAuthors() {
    const gitMetadata = await getLocalGitFileMetadata(this.#path)
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
    entryGroup?: EntryGroup<GroupTypes, FileSystemEntry<any>[]>
    includeDuplicateSegments?: boolean
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

    const entries = await (options?.entryGroup
      ? options.entryGroup.getEntries({ recursive: true })
      : this.#directory.getEntries())
    const path = this.getPathname({
      includeDuplicateSegments: options?.includeDuplicateSegments,
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
}

/** Error for when a file export is not found. */
export class FileExportNotFoundError extends Error {
  constructor(
    path: string,
    name: string,
    className: string = 'JavaScriptFile'
  ) {
    super(`[renoun] ${className} export "${name}" not found in path "${path}"`)
    this.name = 'FileExportNotFoundError'
  }
}

/** A JavaScript file export. */
export class JavaScriptFileExport<Value> {
  #name: string
  #file: JavaScriptFile<any>
  #loader?: ModuleLoader<any>
  #slugCasing: SlugCasings
  #location: Omit<FileExport, 'name'> | undefined
  #metadata: Awaited<ReturnType<typeof getFileExportMetadata>> | undefined

  constructor(
    name: string,
    file: JavaScriptFile<any>,
    loader?: ModuleLoader<any>,
    slugCasing?: SlugCasings
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
    slugCasing?: SlugCasings
  ): Promise<JavaScriptFileExport<Value>> {
    const fileExport = new JavaScriptFileExport<Value>(
      name,
      file,
      loader,
      slugCasing
    )
    await fileExport.getStaticMetadata()
    return fileExport
  }

  async #getLocation() {
    if (this.#location === undefined) {
      this.#location = await this.#file.getExportLocation(this.#name)
    }
    return this.#location
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
  getEditUrl(options?: Pick<GetFileUrlOptions, 'ref'>) {
    return this.#file.getEditUrl({
      ref: options?.ref,
      line: this.#metadata?.location?.position.start.line,
    })
  }

  /** Get the URL to the file export source for the configured git repository. */
  getSourceUrl(options?: Pick<GetFileUrlOptions, 'ref'>) {
    return this.#file.getSourceUrl({
      ref: options?.ref,
      line: this.#metadata?.location?.position.start.line,
    })
  }

  /** Get the URI to the file export source code for the configured editor. */
  getEditorUri() {
    const path = this.#file.getAbsolutePath()

    if (this.#metadata?.location) {
      const location = this.#metadata.location

      return getEditorUri({
        path,
        line: location.position.start.line,
        column: location.position.start.column,
      })
    }

    return getEditorUri({ path })
  }

  /** Get the resolved type of the export. */
  async getType(filter?: SymbolFilter) {
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

  #getModule() {
    if (this.#loader === undefined) {
      const parentPath = this.#file.getParent().getRelativePathToWorkspace()

      throw new Error(
        `[renoun] A loader for the parent Directory at ${parentPath} is not defined.`
      )
    }

    const path = removeExtension(this.#file.getRelativePathToRoot())

    if (isLoader(this.#loader)) {
      return this.#loader(path, this.#file)
    }

    if (isLoaderWithSchema(this.#loader) && this.#loader.runtime) {
      return this.#loader.runtime(path, this.#file)
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
  #exports = new Map<string, JavaScriptFileExport<any>>()
  #loader?: ModuleLoader<Types>
  #slugCasing?: SlugCasings

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

    if (isLoader(this.#loader)) {
      return this.#loader(path, this as any)
    }

    if (isLoaderWithSchema(this.#loader) && 'runtime' in this.#loader) {
      if (this.#loader.runtime === undefined) {
        const parentPath = this.getParent().getRelativePathToWorkspace()

        throw new Error(
          `[renoun] A runtime loader for the parent Directory at ${parentPath} is not defined.`
        )
      }

      return this.#loader.runtime(path, this as any)
    }

    throw new Error(
      `[renoun] This loader is missing a runtime for the parent Directory at ${this.getParent().getRelativePathToWorkspace()}.`
    )
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

    return Promise.all(
      fileExports.map((exportMetadata) =>
        this.getExport(exportMetadata.name as Extract<keyof Types, string>)
      )
    )
  }

  /** Get a JavaScript file export by name. */
  async getExport<ExportName extends Extract<keyof Types, string>>(
    name: ExportName
  ): Promise<JavaScriptFileExport<Types[ExportName]>> {
    if (await this.hasExport(name)) {
      if (this.#exports.has(name)) {
        return this.#exports.get(name)!
      }

      const fileExport = await JavaScriptFileExport.init<Types[ExportName]>(
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

    throw new FileExportNotFoundError(this.getAbsolutePath(), name)
  }

  /** Get a named export from the JavaScript file. */
  async getNamedExport<ExportName extends Extract<keyof Types, string>>(
    name: ExportName
  ): Promise<JavaScriptFileExport<Types[ExportName]>> {
    return this.getExport(name)
  }

  /** Get the default export from the JavaScript file. */
  async getDefaultExport(
    this: Types extends { default: infer _DefaultType }
      ? JavaScriptFile<Types, DirectoryTypes, Path, Extension>
      : never
  ): Promise<
    JavaScriptFileExport<
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
  ): Promise<Types[ExportName]> {
    const fileExport = await this.getExport(name)
    return fileExport.getRuntimeValue()
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
export class MDXFileExport<Value> {
  #name: string
  #file: MDXFile<any>
  #loader?: ModuleLoader<any>
  #slugCasing: SlugCasings

  constructor(
    name: string,
    file: MDXFile<any>,
    loader?: ModuleLoader<any>,
    slugCasing?: SlugCasings
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

  getEditorUri() {
    return this.#file.getEditorUri()
  }

  getEditUrl(options?: Pick<GetFileUrlOptions, 'ref'>) {
    return this.#file.getEditUrl(options)
  }

  getSourceUrl(options?: Pick<GetFileUrlOptions, 'ref'>) {
    return this.#file.getSourceUrl(options)
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

  /**
   * Get the runtime value of the export. An error will be thrown if the export
   * is not found or the configured schema validation for the MDX file fails.
   */
  async getRuntimeValue(): Promise<Value> {
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

  #getModule() {
    if (this.#loader === undefined) {
      const parentPath = this.#file.getParent().getRelativePathToWorkspace()

      throw new Error(
        `[renoun] An mdx loader for the parent Directory at ${parentPath} is not defined.`
      )
    }

    const path = removeExtension(this.#file.getRelativePathToRoot())

    if (isLoader(this.#loader)) {
      return this.#loader(path, this.#file)
    }

    if (isLoaderWithSchema(this.#loader) && this.#loader.runtime) {
      return this.#loader.runtime(path, this.#file)
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
  #exports = new Map<string, MDXFileExport<any>>()
  #loader?: ModuleLoader<{ default: MDXContent } & Types>
  #slugCasing?: SlugCasings

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

  async getExports() {
    const fileModule = await this.#getModule()
    const exportNames = Object.keys(fileModule)

    for (const name of exportNames) {
      if (!this.#exports.has(name)) {
        const mdxExport = new MDXFileExport(
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
  ): Promise<MDXFileExport<({ default: MDXContent } & Types)[ExportName]>> {
    if (this.#exports.has(name)) {
      return this.#exports.get(name)!
    }

    const fileModule = await this.#getModule()

    if (!(name in fileModule)) {
      throw new FileExportNotFoundError(
        this.getAbsolutePath(),
        name,
        MDXFile.name
      )
    }

    const fileExport = new MDXFileExport<
      ({ default: MDXContent } & Types)[ExportName]
    >(name, this as MDXFile<any>, this.#loader, this.#slugCasing)

    this.#exports.set(name, fileExport)

    return fileExport
  }

  /** Get a named export from the MDX file. */
  async getNamedExport<ExportName extends Extract<keyof Types, string>>(
    name: ExportName
  ): Promise<MDXFileExport<Types[ExportName]>> {
    return this.getExport(name)
  }

  /** Get the default export from the MDX file. */
  async getDefaultExport(): Promise<MDXContent> {
    return this.getExport('default').then((fileExport) =>
      fileExport.getRuntimeValue()
    )
  }

  async hasExport(name: string): Promise<boolean> {
    const fileModule = await this.#getModule()
    return name in fileModule
  }

  async getExportValue<
    ExportName extends 'default' | Extract<keyof Types, string>,
  >(name: ExportName): Promise<({ default: MDXContent } & Types)[ExportName]> {
    return this.getExport(name).then((fileExport) =>
      fileExport.getRuntimeValue()
    )
  }

  #getModule() {
    if (this.#loader === undefined) {
      const parentPath = this.getParent().getRelativePathToRoot()

      throw new Error(
        `[renoun] An mdx loader for the parent Directory at ${parentPath} is not defined.`
      )
    }

    const path = removeExtension(this.getRelativePathToRoot())

    if (isLoader(this.#loader)) {
      return this.#loader(path, this as any)
    }

    if (isLoaderWithSchema(this.#loader) && 'runtime' in this.#loader) {
      if (this.#loader.runtime === undefined) {
        const parentPath = this.getParent().getRelativePathToWorkspace()

        throw new Error(
          `[renoun] An mdx runtime loader for the parent Directory at ${parentPath} is not defined.`
        )
      }

      return this.#loader.runtime(path, this as any)
    }

    throw new Error(
      `[renoun] This loader is missing an mdx runtime for the parent Directory at ${this.getParent().getRelativePathToWorkspace()}.`
    )
  }
}

type Narrowed<Include> = Include extends (
  entry: any
) => entry is infer ReturnType
  ? ReturnType
  : never

type ResolveDirectoryIncludeEntries<
  Include,
  Types extends Record<string, any> = Record<string, any>,
> = Include extends string
  ? Include extends `**${string}`
    ? Directory<Types> | FileWithExtension<Types, ExtractFileExtension<Include>>
    : FileWithExtension<Types, ExtractFileExtension<Include>>
  : [Narrowed<Include>] extends [never]
    ? FileSystemEntry<Types>
    : Narrowed<Include>

export type DirectoryInclude<
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
  Include extends DirectoryInclude<
    FileSystemEntry<LoaderTypes>,
    LoaderTypes
  > = DirectoryInclude<FileSystemEntry<LoaderTypes>, LoaderTypes>,
> {
  /** Directory path in the workspace. */
  path?: string

  /** Filter entries with a minimatch pattern or predicate. */
  include?: Include

  /** Extension loaders with or without `withSchema`. */
  loader?: Loaders

  /** Base route prepended to descendant `getPathname()` results. */
  basePathname?: string | null

  /** `tsconfig.json` path used for static analysis. */
  tsConfigPath?: string

  /** Slug casing applied to route segments. */
  slugCasing?: SlugCasings

  /** Custom file‑system adapter. */
  fileSystem?: FileSystem

  /** Sort callback applied at *each* directory depth. */
  sort?: SortDescriptor<ResolveDirectoryIncludeEntries<Include, LoaderTypes>>
}

/** A directory containing files and subdirectories in the file system. */
export class Directory<
  Types extends InferModuleLoadersTypes<Loaders>,
  LoaderTypes extends WithDefaultTypes<Types> = WithDefaultTypes<Types>,
  Loaders extends ModuleLoaders = ModuleLoaders,
  Include extends DirectoryInclude<
    FileSystemEntry<LoaderTypes>,
    LoaderTypes
  > = DirectoryInclude<FileSystemEntry<LoaderTypes>, LoaderTypes>,
> {
  #path: string
  #rootPath?: string
  #basePathname?: string | null
  #tsConfigPath?: string
  #slugCasing: SlugCasings
  #loader?: Loaders
  #directory?: Directory<any, any, any>
  #fileSystem: FileSystem | undefined
  #repository: Repository | undefined
  #includePattern?: string
  #include?:
    | ((
        entry: FileSystemEntry<LoaderTypes>
      ) => entry is FileSystemEntry<LoaderTypes>)
    | ((entry: FileSystemEntry<LoaderTypes>) => Promise<boolean> | boolean)
    | Minimatch
  #sort?: any

  constructor(
    options?: DirectoryOptions<Types, LoaderTypes, Loaders, Include>
  ) {
    if (options === undefined) {
      this.#path = '.'
      this.#slugCasing = 'kebab'
    } else {
      this.#path = options.path ? ensureRelativePath(options.path) : '.'
      this.#loader = options.loader
      this.#basePathname =
        options.basePathname === undefined
          ? this.#directory
            ? this.#directory.getSlug()
            : this.getSlug()
          : options.basePathname
      this.#tsConfigPath = options.tsConfigPath
      this.#slugCasing = options.slugCasing ?? 'kebab'
      this.#fileSystem = options.fileSystem
      if (typeof options.include === 'string') {
        this.#includePattern = options.include
        this.#include = new Minimatch(options.include, { dot: true })
      } else {
        this.#include = options.include
      }
      this.#sort = options.sort as any
    }
  }

  async #shouldInclude(entry: FileSystemEntry<LoaderTypes>): Promise<boolean> {
    if (!this.#include) {
      return true
    }

    if (this.#include instanceof Minimatch) {
      const isRecursivePattern = this.#includePattern!.includes('**')

      if (isRecursivePattern && entry instanceof Directory) {
        return true
      }

      return this.#include.match(entry.getRelativePathToRoot())
    }

    return this.#include(entry)
  }

  /** Duplicate the directory with the same initial options. */
  #duplicate(options?: DirectoryOptions<any, any, any>) {
    const directory = new Directory<
      LoaderTypes,
      LoaderTypes,
      Loaders,
      DirectoryInclude<FileSystemEntry<LoaderTypes>, LoaderTypes>
    >({
      path: this.#path,
      fileSystem: this.#fileSystem,
      basePathname: this.#basePathname,
      tsConfigPath: this.#tsConfigPath,
      slugCasing: this.#slugCasing,
      loader: this.#loader,
      include: this.#include as any,
      sort: this.#sort as any,
      ...options,
    })

    directory.#directory = this
    directory.#includePattern = this.#includePattern
    directory.#repository = this.#repository
    directory.#rootPath = this.getRootPath()
    directory.#pathLookup = this.#pathLookup

    return directory
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
  getRepository() {
    if (this.#repository) {
      return this.#repository
    }

    const config = loadConfig()

    if (config.git) {
      this.#repository = new Repository({
        baseUrl: config.git.source,
        provider: config.git.provider,
      })

      return this.#repository
    }

    throw new Error(
      `[renoun] Git provider is not configured for directory "${this.#path}". Please provide a git provider to enable source links.`
    )
  }

  /** Get the depth of the directory starting from the root directory. */
  getDepth() {
    return this.getPathnameSegments().length - 2
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
    // Always hydrate this directory once and populate its lookup map.
    const entries = await directory.getEntries({
      includeDirectoryNamedFiles: true,
      includeIndexAndReadmeFiles: true,
      includeTsConfigExcludedFiles: true,
    })
    const [currentSegment, ...remainingSegments] = segments

    // If the current segment is empty, we are at the root of this directory.
    if (!currentSegment) {
      return directory
    }

    let fallback: FileSystemEntry<LoaderTypes> | undefined

    for (const entry of entries) {
      const baseSlug = createSlug(entry.getBaseName(), this.#slugCasing)

      if (entry instanceof Directory && baseSlug === currentSegment) {
        return remainingSegments.length === 0
          ? entry
          : this.#findEntry(entry, remainingSegments, allExtensions)
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

    throw new FileNotFoundError(segments.join('/'), allExtensions)
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
          : File<LoaderTypes, Extension>
      : File<LoaderTypes>
  >

  async getFile(path: string | string[], extension?: string | string[]) {
    const rawPath = Array.isArray(path) ? path.join('/') : path
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
      return cachedFile as any
    }

    // normalize the incoming path
    if (
      typeof path === 'string' &&
      (path.startsWith('./') || path.startsWith('.\\'))
    ) {
      path = path.slice(2)
    }

    const rawSegments = Array.isArray(path)
      ? [...path]
      : path.split('/').filter(Boolean)
    const lastSegment = rawSegments.at(-1)
    let parsedExtension: string | undefined

    if (lastSegment) {
      const segmentIndex = lastSegment.lastIndexOf('.')

      if (segmentIndex > 0) {
        parsedExtension = lastSegment.slice(segmentIndex + 1)
        rawSegments[rawSegments.length - 1] = lastSegment.slice(0, segmentIndex)
      }
    }

    if (parsedExtension && extension) {
      throw new Error(
        `[renoun] The path "${rawPath}" already includes a file extension (.${parsedExtension}). The \`extension\` argument can only be used when the path omits an extension.`
      )
    }

    const allExtensions: string[] | undefined = Array.isArray(extension)
      ? extension
      : extension
        ? [extension]
        : parsedExtension
          ? [parsedExtension]
          : undefined
    const segments = rawSegments.map((s) => createSlug(s, this.#slugCasing))

    if (segments.length === 0) {
      throw new FileNotFoundError(rawPath, allExtensions)
    }

    let entry = await this.#findEntry(this, segments, allExtensions)

    // If we ended on a directory, try to find a matching within it
    if (entry instanceof Directory) {
      const directoryEntries = await entry.getEntries({
        includeDirectoryNamedFiles: true,
        includeIndexAndReadmeFiles: true,
      })

      // Find a representative file in the directory
      let sameName: File<LoaderTypes> | undefined
      let fallback: File<LoaderTypes> | undefined

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
        if (
          !sameName &&
          baseName === entry.getBaseName() &&
          hasValidExtension
        ) {
          sameName = directoryEntry
          break // Found the best match, no need to continue
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
      }

      if (sameName) {
        entry = sameName
      } else if (fallback) {
        entry = fallback
      } else {
        throw new FileNotFoundError(rawPath, allExtensions)
      }
    }

    if (entry instanceof File) {
      return entry as any
    }

    throw new FileNotFoundError(rawPath, allExtensions)
  }

  /** Get a directory at the specified `path`. */
  async getDirectory(path: string | string[]): Promise<Directory<LoaderTypes>> {
    const segments = Array.isArray(path)
      ? path.slice(0)
      : path.split('/').filter(Boolean)
    let currentDirectory = this as Directory<LoaderTypes>

    while (segments.length > 0) {
      const currentSegment = createSlug(segments.shift()!, this.#slugCasing)
      const allEntries = await currentDirectory.getEntries({
        includeDirectoryNamedFiles: true,
        includeTsConfigExcludedFiles: true,
      })
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
        throw new FileNotFoundError(path)
      }

      currentDirectory = entry
    }

    return currentDirectory
  }

  /** Get a file or directory at the specified `path`. Files will be prioritized over directories. */
  async getEntry(
    path: string | string[]
  ): Promise<FileSystemEntry<LoaderTypes>> {
    return this.getFile(path).catch((error) => {
      if (error instanceof FileNotFoundError) {
        return this.getDirectory(path)
      }
      throw error
    })
  }

  #entriesCache = new Map<string, FileSystemEntry<LoaderTypes>[]>()
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
  }

  /**
   * Retrieves all entries (files and directories) within the current directory
   * that are not excluded by Git ignore rules or the closest `tsconfig` file.
   * Additionally, `index` and `readme` files are excluded by default.
   */
  async getEntries(options?: {
    /** Recursively walk every subdirectory. */
    recursive?: Include extends string
      ? Include extends `**${string}`
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
      Include extends string
        ? Include extends `**${string}`
          ?
              | Directory<LoaderTypes>
              | FileWithExtension<LoaderTypes, ExtractFileExtension<Include>>
          : FileWithExtension<LoaderTypes, ExtractFileExtension<Include>>
        : Include extends DirectoryInclude<infer FilteredEntry, LoaderTypes>
          ? FilteredEntry
          : FileSystemEntry<LoaderTypes>
    >
  > {
    if (options?.recursive && this.#includePattern) {
      if (!this.#includePattern.includes('**')) {
        throw new Error(
          '[renoun] Cannot use recursive option with a single-level include filter. Use a multi-level pattern (e.g. "**/*.mdx") instead.'
        )
      }
    }

    let cacheKey = ''

    if (process.env.NODE_ENV === 'production') {
      if (options) {
        cacheKey += options.recursive ? 'r' : ''
        cacheKey += options.includeDirectoryNamedFiles ? 'd' : ''
        cacheKey += options.includeIndexAndReadmeFiles ? 'i' : ''
        cacheKey += options.includeGitIgnoredFiles ? 'g' : ''
        cacheKey += options.includeTsConfigExcludedFiles ? 't' : ''
      }

      if (this.#entriesCache.has(cacheKey)) {
        return this.#entriesCache.get(cacheKey)! as any
      }
    }

    const fileSystem = this.getFileSystem()
    const directoryEntries = await fileSystem.readDirectory(this.#path)
    const entriesMap = new Map<string, FileSystemEntry<LoaderTypes>>()

    for (const entry of directoryEntries) {
      const shouldSkipIndexOrReadme = options?.includeIndexAndReadmeFiles
        ? false
        : ['index', 'readme'].some((n) =>
            entry.name.toLowerCase().startsWith(n)
          )

      if (
        shouldSkipIndexOrReadme ||
        (!options?.includeGitIgnoredFiles &&
          fileSystem.isFilePathGitIgnored(entry.path)) ||
        (!options?.includeTsConfigExcludedFiles &&
          fileSystem.isFilePathExcludedFromTsConfig(
            entry.path,
            entry.isDirectory
          ))
      ) {
        continue
      }

      const entryKey =
        entry.isDirectory || options?.includeDirectoryNamedFiles
          ? entry.path
          : removeAllExtensions(entry.path)

      if (entriesMap.has(entryKey)) {
        continue
      }

      if (entry.isDirectory) {
        const subdirectory = this.#duplicate({ path: entry.path })
        entriesMap.set(entryKey, subdirectory)
        this.#addPathLookup(subdirectory)
      } else if (entry.isFile) {
        const sharedOptions = {
          path: entry.path,
          directory: this,
          basePathname: this.#basePathname,
          slugCasing: this.#slugCasing,
        } as const
        const extension = extensionName(entry.name).slice(1)
        const loader = this.#loader?.[extension] as
          | ModuleLoader<LoaderTypes[any]>
          | undefined
        const file =
          extension === 'mdx'
            ? new MDXFile({ ...sharedOptions, loader })
            : isJavaScriptLikeExtension(extension)
              ? new JavaScriptFile({ ...sharedOptions, loader })
              : new File(sharedOptions)

        if (this.#include && !(await this.#shouldInclude(file))) {
          continue
        }

        entriesMap.set(entryKey, file)
        this.#addPathLookup(file)
      }
    }

    const immediateEntries = Array.from(
      entriesMap.values()
    ) as FileSystemEntry<LoaderTypes>[]

    if (this.#sort) {
      try {
        await sortEntries(immediateEntries, this.#sort)
      } catch (error) {
        const badge = '[renoun] '
        if (error instanceof Error && error.message.includes(badge)) {
          throw new Error(
            `[renoun] Error occurred while sorting entries for directory at "${this.#path}". \n\n${error.message.slice(
              badge.length
            )}`
          )
        }
        throw error
      }
    }

    const result: FileSystemEntry<LoaderTypes>[] = []

    for (const entry of immediateEntries) {
      if (entry instanceof Directory) {
        const includeSelf = this.#include
          ? await this.#shouldInclude(entry)
          : true
        const children = options?.recursive
          ? await entry.getEntries(options)
          : []

        if (includeSelf && (children.length > 0 || !options?.recursive)) {
          result.push(entry)
        }

        const directoryBaseName = entry.getBaseName()

        for (const child of children) {
          const isDirectoryNamedFile =
            child instanceof File &&
            child.getParent() === entry &&
            child.getBaseName() === directoryBaseName &&
            !options?.includeDirectoryNamedFiles

          if (!isDirectoryNamedFile) {
            result.push(child)
          }
        }
      } else {
        result.push(entry)
      }
    }

    if (process.env.NODE_ENV === 'production') {
      this.#entriesCache.set(cacheKey, result)
    }

    return result as any
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
    entryGroup?: EntryGroup<GroupTypes, FileSystemEntry<any>[]>
  }): Promise<
    [
      FileSystemEntry<LoaderTypes> | undefined,
      FileSystemEntry<LoaderTypes> | undefined,
    ]
  > {
    let entries: FileSystemEntry<LoaderTypes>[]

    if (options?.entryGroup) {
      entries = await options.entryGroup.getEntries({ recursive: true })
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

    const segments = path.split('/')

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
  #getRepositoryUrl(options?: Omit<GetDirectoryUrlOptions, 'path'>) {
    return this.getRepository().getDirectoryUrl({
      path: this.getRelativePathToWorkspace(),
      ...options,
    })
  }

  /** Get the URL to the directory history for the configured git repository. */
  getHistoryUrl(options?: Pick<GetFileUrlOptions, 'ref'>) {
    return this.#getRepositoryUrl({
      type: 'history',
      ref: options?.ref,
    })
  }

  /** Get the URL to the directory source for the configured git repository. */
  getSourceUrl(options?: Pick<GetFileUrlOptions, 'ref'>) {
    return this.#getRepositoryUrl({
      type: 'source',
      ref: options?.ref,
    })
  }

  /** Get the URI to the directory source code for the configured editor. */
  getEditorUri() {
    return getEditorUri({ path: this.getAbsolutePath() })
  }

  /** Get the first local git commit date of this directory. */
  async getFirstCommitDate() {
    const gitMetadata = await getLocalGitFileMetadata(this.#path)
    return gitMetadata.firstCommitDate
  }

  /** Get the last local git commit date of this directory. */
  async getLastCommitDate() {
    const gitMetadata = await getLocalGitFileMetadata(this.#path)
    return gitMetadata.lastCommitDate
  }

  /** Get the local git authors of this directory. */
  async getAuthors() {
    const gitMetadata = await getLocalGitFileMetadata(this.#path)
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

  /** Get an export value from either an readme or index file in this directory. */
  async getExportValue<ExportName extends LoaderExportNames<LoaderTypes>>(
    name: ExportName
  ): Promise<LoaderExportValue<LoaderTypes, ExportName>> {
    // Try index file first
    try {
      const indexFile = await this.getFile('index')
      if (indexFile instanceof JavaScriptFile || indexFile instanceof MDXFile) {
        try {
          return await indexFile.getExportValue(name)
        } catch (error) {
          // If index file exists but doesn't have the export, try README
          if (error instanceof FileExportNotFoundError) {
            const readmeFile = await this.getFile('readme')
            if (
              readmeFile instanceof JavaScriptFile ||
              readmeFile instanceof MDXFile
            ) {
              return readmeFile.getExportValue(name)
            }
          }
          throw error
        }
      }
    } catch {
      // If index file doesn't exist, try README
      try {
        const readmeFile = await this.getFile('readme')
        if (
          readmeFile instanceof JavaScriptFile ||
          readmeFile instanceof MDXFile
        ) {
          return readmeFile.getExportValue(name)
        }
      } catch {
        throw new Error(
          `[renoun] Could not find an index or readme file with export "${String(name)}" in directory "${this.getRelativePathToRoot()}"`
        )
      }
    }
    throw new Error(
      `[renoun] Found index or readme file but it did not export "${String(name)}" in directory "${this.getRelativePathToRoot()}"`
    )
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

/** Options for an `EntryGroup`. */
export interface EntryGroupOptions<Entries extends FileSystemEntry<any>[]> {
  entries: Entries
}

/** A group of file system entries. */
export class EntryGroup<
  Types extends InferModuleLoadersTypes<Loaders>,
  const Entries extends FileSystemEntry<any>[] = FileSystemEntry<any>[],
  const Loaders extends ModuleLoaders = LoadersFromEntries<Entries>,
> {
  #entries: Entries

  constructor(options: EntryGroupOptions<Entries>) {
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
          allEntries.push(...(await entry.getEntries(options)))
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
      ? path
      : path.split('/').filter(Boolean)
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
          : File<Types>
      : File<Types>
  > {
    const normalizedPath = Array.isArray(path)
      ? path.slice(0)
      : path.split('/').filter(Boolean)
    const rootPath = normalizedPath.at(0)

    for (const entry of this.#entries) {
      const baseName = entry.getBaseName()
      const isRootDirectory = baseName === '.'

      if (isRootDirectory || baseName === rootPath) {
        if (entry instanceof Directory) {
          const directoryFile = await entry
            .getFile(
              isRootDirectory ? normalizedPath : normalizedPath.slice(1),
              extension as any
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
      ? path.slice(0)
      : path.split('/').filter(Boolean)
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
  entry: FileSystemEntry<Types> | undefined
): entry is Directory<Types> {
  return entry instanceof Directory
}

/** Determines the type of a `FileSystemEntry` based on its extension. */
export type FileWithExtension<
  Types extends Record<string, any>,
  Extension = LoadersToExtensions<Types>,
> = Extension extends string
  ? IsJavaScriptLikeExtension<Extension> extends true
    ? JavaScriptFile<Types[Extension], Types, any, Extension>
    : Extension extends 'mdx'
      ? MDXFile<Types['mdx'], Types, any, Extension>
      : File<Types>
  : Extension extends string[]
    ? HasJavaScriptLikeExtensions<Extension> extends true
      ? JavaScriptFile<Types[Extension[number]], Types, any, Extension[number]>
      : Extension[number] extends 'mdx'
        ? MDXFile<Types['mdx'], Types, any, Extension[number]>
        : File<Types>
    : File<Types>

type StringUnion<Type> = Extract<Type, string> | (string & {})

/** Resolves valid extension patterns from an object of loaders. */
type LoadersToExtensions<
  DirectoryLoaders extends ModuleLoaders,
  ExtensionUnion = StringUnion<keyof DirectoryLoaders>,
> = ExtensionUnion | ExtensionUnion[]

/**
 * Determines if a `FileSystemEntry` is a `File` and optionally narrows the
 * result based on the provided extensions.
 */
export function isFile<
  Types extends Record<string, any>,
  const Extension extends StringUnion<keyof Types> | StringUnion<keyof Types>[],
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

/** Determines if a `FileSystemEntry` is an `MDXFile`. */
export function isMDXFile<
  FileTypes extends Record<string, any>,
  DirectoryTypes extends Record<string, any> = Record<string, any>,
>(
  entry: FileSystemEntry<DirectoryTypes> | undefined
): entry is MDXFile<FileTypes, DirectoryTypes> {
  return entry instanceof MDXFile
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

  return async (entry: any) => {
    let value = await entry.getExportValue(exportName)
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
