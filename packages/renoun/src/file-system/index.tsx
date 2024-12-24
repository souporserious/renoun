import * as React from 'react'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import { minimatch } from 'minimatch'

import { getFileExportMetadata } from '../project/client.js'
import { createSlug, type SlugCasings } from '../utils/create-slug.js'
import { formatNameAsTitle } from '../utils/format-name-as-title.js'
import { getEditorUri } from '../utils/get-editor-uri.js'
import type { FileExport } from '../utils/get-file-exports.js'
import { getLocalGitFileMetadata } from '../utils/get-local-git-file-metadata.js'
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
} from '../utils/path.js'
import type { SymbolFilter } from '../utils/resolve-type.js'
import { FileName } from './FileName.js'
import type { FileSystem } from './FileSystem.js'
import { NodeFileSystem } from './NodeFileSystem.js'
import {
  Repository,
  type GetFileUrlOptions,
  type GetDirectoryUrlOptions,
} from './Repository.js'
import type { ExtractFilePatternExtension } from './types.js'

type RuntimeLoader<Types> = (path: string) => Promise<Types>

type ModuleExports = {
  [exportName: string]: any
}

type ModuleExportsWithStandardSchema = {
  [exportName: string]: StandardSchemaV1
}

type ModuleTypes = {
  [extension: string]: ModuleExports | ModuleExportsWithStandardSchema
}

type ModuleExportValidators<Exports extends ModuleExports> = {
  [ExportName in keyof Exports]: (
    value: Exports[ExportName]
  ) => Exports[ExportName]
}

interface ModuleLoaderWithSchema<Exports extends ModuleExports> {
  schema: ModuleExportValidators<Exports>
  runtime: RuntimeLoader<NoInfer<Exports>>
}

interface ModuleLoaderWithStandardSchema<
  Exports extends ModuleExportsWithStandardSchema,
> {
  schema: {
    [ExportName in keyof Exports]: StandardSchemaV1.InferOutput<
      Exports[ExportName]
    >
  }
  runtime?: RuntimeLoader<NoInfer<Exports>>
}

export function withSchema<
  Types extends ModuleExports,
>(): ModuleLoaderWithSchema<Types>

export function withSchema<Types extends ModuleExports>(
  runtime: RuntimeLoader<NoInfer<Types>>
): ModuleLoaderWithSchema<Types>

export function withSchema<Types extends ModuleExports>(
  schema: ModuleExportValidators<Types>,
  runtime: RuntimeLoader<NoInfer<Types>>
): ModuleLoaderWithSchema<Types>

export function withSchema(schemaOrRuntime?: any, maybeRuntime?: any) {
  return maybeRuntime
    ? {
        schema: schemaOrRuntime,
        runtime: maybeRuntime,
      }
    : schemaOrRuntime
}

type FileLoader<Schema extends ModuleExports> =
  | RuntimeLoader<Schema>
  | ModuleLoaderWithSchema<Schema>
  | ModuleLoaderWithStandardSchema<Schema>

type FileLoaders<Types extends ModuleTypes = ModuleTypes> = {
  [Extension in keyof Types]: FileLoader<Types[Extension]>
}

type InferFileLoader<
  Loader extends
    | RuntimeLoader<any>
    | ModuleLoaderWithSchema<any>
    | ModuleLoaderWithStandardSchema<any>,
> =
  Loader extends RuntimeLoader<infer Value>
    ? Value
    : Loader extends ModuleLoaderWithSchema<infer Value>
      ? Value
      : Loader extends ModuleLoaderWithStandardSchema<any>
        ? {
            [ExportName in keyof Loader['schema']]: StandardSchemaV1.InferOutput<
              Loader['schema'][ExportName]
            >
          }
        : never

type InferFileLoaders<Loaders extends FileLoaders> = {
  [Extension in keyof Loaders]: InferFileLoader<Loaders[Extension]>
}

/** Determines if the loader is a resolver. */
function isLoader(loader: FileLoader<any>): loader is RuntimeLoader<any> {
  return typeof loader === 'function'
}

/** Determines if the loader is a resolver with a schema. */
function isLoaderWithSchema<Schema extends ModuleExports>(
  loader: FileLoader<Schema>
): loader is Schema extends ModuleExports
  ? ModuleLoaderWithSchema<Schema> | ModuleLoaderWithStandardSchema<Schema>
  : never {
  return 'schema' in loader
}

export type PathCasings = SlugCasings

/** A directory or file entry. */
export type FileSystemEntry<
  FileTypes extends Record<string, any> = Record<string, any>,
> = Directory<FileTypes> | File<FileTypes>

/** Options for a file in the file system. */
export interface FileOptions<
  FileTypes extends Record<string, any> = Record<string, any>,
> {
  path: string
  pathCasing: PathCasings
  depth: number
  directory: Directory<
    FileTypes,
    FileLoaders<FileTypes>,
    EntryInclude<FileSystemEntry<FileTypes>, FileTypes>
  >
}

/** A file in the file system. */
export class File<
  FileTypes extends Record<string, any> = Record<string, any>,
> extends FileName {
  #path: string
  #pathCasing: PathCasings
  #depth: number
  #directory: Directory<FileTypes>

  constructor(options: FileOptions<FileTypes>) {
    super(baseName(options.path))
    this.#path = options.path
    this.#pathCasing = options.pathCasing
    this.#depth = options.depth
    this.#directory = options.directory
  }

  /** Get the directory containing this file. */
  getParent() {
    return this.#directory
  }

  /** Get the depth of the file starting from the root directory. */
  getDepth() {
    return this.#depth
  }

  /** Get the slug of the file. */
  getSlug() {
    return createSlug(this.getName(), this.#pathCasing)
  }

  /**
   * Get the base name of the file excluding the extension. The directory name
   * will be used if the file is an index or readme file.
   */
  override getName() {
    let name = this.getBaseName()

    // Use the directory name if the file is an index or readme file
    if (['index', 'readme'].includes(name.toLowerCase())) {
      const directoryName = this.#directory.getName()
      // Use the directory name if it's not the root directory
      if (directoryName !== '.') {
        name = directoryName
      }
    }

    return name.split('.').at(0)!
  }

  /** Get the path of the file. */
  getPath(options?: {
    includeBasePath?: boolean
    includeDuplicateSegments?: boolean
  }) {
    const includeBasePath = options?.includeBasePath ?? true
    const includeDuplicateSegments = options?.includeDuplicateSegments ?? false
    const fileSystem = this.#directory.getFileSystem()
    const basePath = this.#directory.getBasePath()
    let path = fileSystem.getPath(
      this.#path,
      includeBasePath ? { basePath } : undefined
    )

    if (!includeDuplicateSegments || this.#pathCasing !== 'none') {
      const parsedPath = path.split('/')
      const parsedSegments: string[] = []

      for (let index = 0; index < parsedPath.length; index++) {
        const segment = parsedPath[index]

        if (includeDuplicateSegments || segment !== parsedPath[index - 1]) {
          parsedSegments.push(
            this.#pathCasing === 'none'
              ? segment
              : createSlug(segment, this.#pathCasing)
          )
        }
      }

      path = parsedSegments.join('/')
    }

    return path
  }

  /** Get the path segments of the file. */
  getPathSegments(options?: {
    includeBasePath?: boolean
    includeDuplicateSegments?: boolean
  }) {
    const includeBasePath = options?.includeBasePath ?? true
    const includeDuplicateSegments = options?.includeDuplicateSegments ?? false

    return this.getPath({ includeBasePath, includeDuplicateSegments })
      .split('/')
      .filter(Boolean)
  }

  /** Get the file path relative to the root directory. */
  getRelativePath() {
    const fileSystem = this.#directory.getFileSystem()
    return fileSystem.getRelativePath(this.#path)
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

  /** Get the URL to the file source code for the configured remote git repository. */
  getRepositoryUrl(options?: Omit<GetFileUrlOptions, 'path'>) {
    const repository = this.#directory.getRepository()
    const fileSystem = this.#directory.getFileSystem()

    return repository.getFileUrl({
      path: fileSystem.getRelativePathToWorkspace(this.#path),
      ...options,
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

  /**
   * Get the previous and next sibling entries (files or directories) of the parent directory.
   * If the file is an index or readme file, the siblings will be retrieved from the parent directory.
   */
  async getSiblings<
    GroupFileTypes extends Record<string, any> = FileTypes,
  >(options?: {
    entryGroup?: EntryGroup<FileSystemEntry<any>[], GroupFileTypes>
    includeDuplicateSegments?: boolean
  }): Promise<
    [
      FileSystemEntry<FileTypes> | undefined,
      FileSystemEntry<FileTypes> | undefined,
    ]
  > {
    const isIndexOrReadme = ['index', 'readme'].includes(
      this.getBaseName().toLowerCase()
    )
    if (isIndexOrReadme) {
      return this.#directory.getSiblings()
    }

    const entries = await (options?.entryGroup
      ? options.entryGroup.getEntries({ recursive: true })
      : this.#directory.getEntries())
    const path = this.getPath({
      includeDuplicateSegments: options?.includeDuplicateSegments,
    })
    const index = entries.findIndex((entry) => entry.getPath() === path)
    const previous = index > 0 ? entries[index - 1] : undefined
    const next = index < entries.length - 1 ? entries[index + 1] : undefined

    return [previous, next]
  }
}

type ValueFromExport<
  FileTypes extends Record<string, any> = Record<string, any>,
> = FileTypes[Extract<keyof FileTypes, string>]

/** A JavaScript file export. */
export class JavaScriptFileExport<Value> {
  #name: string
  #file: JavaScriptFile<any>
  #loader?: FileLoader<any>
  #location: Omit<FileExport, 'name'> | undefined
  #metadata: Awaited<ReturnType<typeof getFileExportMetadata>> | undefined

  constructor(
    name: string,
    file: JavaScriptFile<any>,
    loader?: FileLoader<any>
  ) {
    this.#name = name
    this.#file = file
    this.#loader = loader
  }

  static async init<Value>(
    name: string,
    file: JavaScriptFile<any>,
    loader?: FileLoader<any>
  ): Promise<JavaScriptFileExport<Value>> {
    const fileExport = new JavaScriptFileExport<Value>(name, file, loader)
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
    return createSlug(this.getName(), 'kebab')
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

  /** Get the text of the export. */
  getText() {
    return this.#metadata?.text
  }

  /** Get the start and end position of the export in the file system. */
  getPosition() {
    return this.#metadata?.location.position
  }

  /** Get the URL to the file export source code for the configured remote git repository. */
  getRepositoryUrl(options?: Omit<GetFileUrlOptions, 'path' | 'line'>) {
    return this.#file.getRepositoryUrl({
      line: this.#metadata?.location?.position.start.line,
      ...options,
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
        `[renoun] Export can not be statically analyzed at file path "${this.#file.getRelativePath()}".`
      )
    }

    const fileSystem = this.#file.getParent().getFileSystem()

    return fileSystem.resolveTypeAtLocation(
      this.#file.getAbsolutePath(),
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

    const path = removeExtension(this.#file.getRelativePath())

    if (isLoader(this.#loader)) {
      return this.#loader(path)
    }

    if (this.#loader.runtime === undefined) {
      const parentPath = this.#file.getParent().getRelativePathToWorkspace()

      throw new Error(
        `[renoun] A runtime loader for the parent Directory at ${parentPath} is not defined.`
      )
    }

    return this.#loader.runtime(path)
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

    const exportValue = this.#file.parseExportValue(
      this.#name,
      fileModuleExport
    )

    /* Enable hot module reloading in development for Next.js component exports. */
    if (process.env.NODE_ENV === 'development') {
      const isReactComponent = exportValue
        ? /^[A-Z]/.test(exportValue.name) && String(exportValue).includes('jsx')
        : false

      if (isReactComponent) {
        const Component = exportValue as React.ComponentType
        const WrappedComponent = async (props: Record<string, unknown>) => {
          const { Refresh } = await import('./Refresh.js')

          return (
            <>
              <Refresh />
              <Component {...props} />
            </>
          )
        }

        return WrappedComponent as Value
      }
    }

    return exportValue
  }
}

/** Options for a JavaScript file in the file system. */
export interface JavaScriptFileOptions<FileTypes extends Record<string, any>>
  extends FileOptions<FileTypes> {
  loader?: FileLoader<FileTypes>
}

/** A JavaScript file in the file system. */
export class JavaScriptFile<
  FileTypes extends Record<string, any> = Record<string, any>,
> extends File<FileTypes> {
  #exports = new Map<string, JavaScriptFileExport<ValueFromExport<FileTypes>>>()
  #loader?: FileLoader<FileTypes>

  constructor({ loader, ...fileOptions }: JavaScriptFileOptions<FileTypes>) {
    super(fileOptions)
    this.#loader = loader
  }

  #getModule() {
    if (this.#loader === undefined) {
      const parentPath = this.getParent().getRelativePath()

      throw new Error(
        `[renoun] A loader for the parent Directory at ${parentPath} is not defined.`
      )
    }

    const path = removeExtension(this.getRelativePath())

    if (isLoader(this.#loader)) {
      return this.#loader(path)
    }

    if (this.#loader.runtime === undefined) {
      const parentPath = this.getParent().getRelativePathToWorkspace()

      throw new Error(
        `[renoun] A runtime loader for the parent Directory at ${parentPath} is not defined.`
      )
    }

    return this.#loader.runtime(path)
  }

  /** Parse and validate an export value using the configured schema if available. */
  parseExportValue(name: string, value: any): any {
    const extension = this.getExtension()

    if (!extension || !this.#loader) {
      return value
    }

    if (isLoaderWithSchema(this.#loader)) {
      let parseValue = this.#loader.schema[name]

      if (parseValue) {
        try {
          if ('~standard' in parseValue) {
            const result = parseValue['~standard'].validate(
              value
            ) as StandardSchemaV1.Result<any>

            if (result.issues) {
              const issuesMessage = result.issues
                .map((issue) => issue.message)
                .join(', ')

              throw new Error(
                `[renoun] Schema validation failed for export "${name}" at file path "${this.getRelativePath()}" with the following issues: ${issuesMessage}`
              )
            }

            value = result.value
          } else {
            value = parseValue(value)
          }
        } catch (error) {
          if (error instanceof Error) {
            throw new Error(
              `[renoun] Schema validation failed to parse export "${name}" at file path "${this.getRelativePath()}" errored with: ${error.message}`
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
        this.getExportOrThrow(
          exportMetadata.name as Extract<keyof FileTypes, string>
        )
      )
    )
  }

  /** Get a JavaScript file export by name. */
  async getExport<ExportName extends Extract<keyof FileTypes, string>>(
    name: ExportName
  ): Promise<JavaScriptFileExport<ValueFromExport<FileTypes>> | undefined> {
    if (await this.hasExport(name)) {
      if (this.#exports.has(name)) {
        return this.#exports.get(name)!
      }

      const fileExport = await JavaScriptFileExport.init<
        ValueFromExport<FileTypes>
      >(name, this, this.#loader)

      this.#exports.set(name, fileExport)

      return fileExport
    }

    if (this.#loader) {
      throw new Error(
        `[renoun] JavaScript file export "${name}" could not be determined statically or at runtime for path "${this.getRelativePathToWorkspace()}".\n    - Ensure the export exists\n    - Verify the file for syntax errors\n    - Confirm that your bundler supports resolving "${this.getExtension()}" extensions`
      )
    } else {
      throw new Error(
        `[renoun] JavaScript file export "${name}" could not be determined statically or at runtime for path "${this.getAbsolutePath()}". Ensure the directory has a loader defined for resolving "${this.getExtension()}" files.`
      )
    }
  }

  /** Get a JavaScript file export by name or throw an error if it does not exist. */
  async getExportOrThrow<ExportName extends Extract<keyof FileTypes, string>>(
    name: ExportName
  ): Promise<JavaScriptFileExport<ValueFromExport<FileTypes>>> {
    const fileExport = await this.getExport(name)

    if (fileExport === undefined) {
      throw new Error(
        `[renoun] JavaScript file export "${name}" not found in path "${this.getAbsolutePath()}"`
      )
    }

    return fileExport
  }

  /** Get the start position of an export in the JavaScript file. */
  async getExportLocation(name: string) {
    const fileExports = await this.#getExports()
    return fileExports.find((exportMetadata) => exportMetadata.name === name)
  }

  /** Get the runtime value of an export in the JavaScript file. */
  async getExportValue<ExportName extends Extract<keyof FileTypes, string>>(
    name: ExportName
  ): Promise<FileTypes[ExportName] | undefined> {
    const fileExport = await this.getExport(name)
    return fileExport?.getRuntimeValue() as FileTypes[ExportName] | undefined
  }

  /** Get the runtime value of an export in the JavaScript file or throw an error if it does not exist. */
  async getExportValueOrThrow<
    ExportName extends Extract<keyof FileTypes, string>,
  >(name: ExportName): Promise<FileTypes[ExportName]> {
    const fileExport = await this.getExportOrThrow(name)
    return fileExport.getRuntimeValue() as FileTypes[ExportName]
  }

  /** Check if an export exists in the JavaScript file. */
  async #hasStaticExport(name: string): Promise<boolean> {
    try {
      const location = await this.getExportLocation(name)
      return location !== undefined
    } catch {
      return false
    }
  }

  /** Check if an export exists in the JavaScript file. */
  async hasExport(name: string): Promise<boolean> {
    // First, attempt to statically analyze the export
    if (await this.#hasStaticExport(name)) {
      return true
    }

    // Fallback to runtime check
    try {
      const fileModule = await this.#getModule()
      return name in fileModule
    } catch {
      return false
    }
  }
}

export type EntryInclude<
  Entry extends FileSystemEntry<any>,
  FileTypes extends Record<string, any>,
> =
  | ((entry: FileSystemEntry<FileTypes>) => entry is Entry)
  | ((entry: FileSystemEntry<FileTypes>) => Promise<boolean> | boolean)
  | string

export type IncludedEntry<
  FileTypes extends Record<string, any>,
  DirectoryFilter extends EntryInclude<FileSystemEntry<FileTypes>, FileTypes>,
> = DirectoryFilter extends string
  ? FileWithExtension<FileTypes, ExtractFilePatternExtension<DirectoryFilter>>
  : DirectoryFilter extends EntryInclude<infer Entry, FileTypes>
    ? Entry
    : FileSystemEntry<FileTypes>

/** The options for a `Directory`. */
interface DirectoryOptions<
  FileTypes extends InferFileLoaders<Loaders> = any,
  Loaders extends FileLoaders = FileLoaders,
  Include extends EntryInclude<
    FileSystemEntry<FileTypes>,
    FileTypes
  > = EntryInclude<FileSystemEntry<FileTypes>, FileTypes>,
> {
  /** The path to the directory in the file system. */
  path?: string

  /** An array of filenames or patterns to include when querying entries. The filenames are resolved relative to the working directory. */
  include?: Include

  /** The extension definitions to use for loading and validating file exports. */
  loaders?: Loaders

  /** The base path to apply to all descendant entry `getPath` and `getPathSegments` methods. */
  basePath?: string

  /** The tsconfig.json file path to use for type checking and analyzing JavaScript and TypeScript files. */
  tsConfigPath?: string

  /** The path casing to apply to all descendant entry `getPath` and `getPathSegments` methods. */
  pathCasing?: PathCasings

  /** The file system to use for reading directory entries. */
  fileSystem?: FileSystem

  /** A sort callback applied to all descendant entries. */
  sort?: (
    a: IncludedEntry<NoInfer<FileTypes>, Include>,
    b: IncludedEntry<NoInfer<FileTypes>, Include>
  ) => Promise<number> | number
}

/** A directory containing files and subdirectories in the file system. */
export class Directory<
  FileTypes extends InferFileLoaders<Loaders>,
  Loaders extends FileLoaders = FileLoaders,
  Include extends EntryInclude<
    FileSystemEntry<FileTypes>,
    FileTypes
  > = EntryInclude<FileSystemEntry<FileTypes>, FileTypes>,
> {
  #path: string
  #depth: number = -1
  #pathCasing: PathCasings = 'kebab'
  #basePath?: string
  #tsConfigPath?: string
  #loaders?: Loaders
  #directory?: Directory<FileTypes>
  #fileSystem: FileSystem | undefined
  #repository: Repository | undefined
  #include?:
    | ((
        entry: FileSystemEntry<FileTypes>
      ) => entry is FileSystemEntry<FileTypes>)
    | ((entry: FileSystemEntry<FileTypes>) => Promise<boolean> | boolean)
    | string
  #sort?: (
    a: FileSystemEntry<FileTypes>,
    b: FileSystemEntry<FileTypes>
  ) => Promise<number> | number

  constructor(options?: DirectoryOptions<FileTypes, Loaders, Include>) {
    if (options === undefined) {
      this.#path = '.'
    } else {
      this.#path = ensureRelativePath(options.path)
      this.#pathCasing = options.pathCasing ?? 'kebab'
      this.#loaders = options.loaders
      this.#include = options.include
      this.#sort = options.sort as any
      this.#basePath = options.basePath
      this.#tsConfigPath = options.tsConfigPath
      this.#fileSystem = options.fileSystem
    }
  }

  async #shouldInclude(entry: FileSystemEntry<FileTypes>): Promise<boolean> {
    if (!this.#include) {
      return true
    }

    if (typeof this.#include === 'string') {
      return minimatch(entry.getRelativePath(), this.#include)
    }

    return this.#include(entry)
  }

  /** Duplicate the directory with the same initial options. */
  #duplicate(
    options?: DirectoryOptions<
      FileTypes,
      Loaders,
      EntryInclude<FileSystemEntry<FileTypes>, FileTypes>
    >
  ): Directory<
    FileTypes,
    Loaders,
    EntryInclude<FileSystemEntry<FileTypes>, FileTypes>
  > {
    const directory = new Directory<
      FileTypes,
      Loaders,
      EntryInclude<FileSystemEntry<FileTypes>, FileTypes>
    >({
      path: this.#path,
      fileSystem: this.#fileSystem,
      ...options,
    })

    directory.#depth = this.#depth
    directory.#tsConfigPath = this.#tsConfigPath
    directory.#pathCasing = this.#pathCasing
    directory.#basePath = this.#basePath
    directory.#loaders = this.#loaders
    directory.#sort = this.#sort
    directory.#include = this.#include

    return directory
  }

  /** Get the file system for this directory. */
  getFileSystem() {
    if (this.#fileSystem) {
      return this.#fileSystem
    }

    this.#fileSystem = new NodeFileSystem({
      rootPath: this.#path,
      tsConfigPath: this.#tsConfigPath,
    })

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
    return this.#depth
  }

  /** Get a file at the specified `path` and optional extensions. */
  async getFile<
    ExtensionType extends keyof FileTypes | string,
    const Extension extends ExtensionType | Extension[],
  >(
    path: string | string[],
    extension?: Extension | Extension[]
  ): Promise<
    | (Extension extends string
        ? IsJavaScriptLikeExtension<Extension> extends true
          ? JavaScriptFile<FileTypes[Extension]>
          : File<FileTypes>
        : File<FileTypes>)
    | undefined
  > {
    const segments = Array.isArray(path)
      ? path.slice(0)
      : path.split('/').filter(Boolean)
    let currentDirectory = this as Directory<FileTypes>

    while (segments.length > 0) {
      let entry: FileSystemEntry<FileTypes> | undefined
      const currentSegment = createSlug(segments.shift()!, this.#pathCasing)
      const lastSegment = segments.at(-1)
      const allEntries = await currentDirectory.getEntries({
        includeDuplicates: true,
        includeIndexAndReadme: true,
        includeTsConfigIgnoredFiles: true,
      })

      // Find the entry matching the current segment
      for (const currentEntry of allEntries) {
        const baseSegment = createSlug(
          currentEntry.getBaseName(),
          this.#pathCasing
        )

        if (baseSegment === currentSegment) {
          const matchesModifier =
            (currentEntry instanceof File && currentEntry.getModifier()) ===
            lastSegment

          // Check if the entry is a file and matches the extension
          if (extension && currentEntry instanceof File) {
            const fileExtensions = Array.isArray(extension)
              ? extension
              : [extension]

            if (
              fileExtensions.includes(currentEntry.getExtension() as Extension)
            ) {
              if (matchesModifier) {
                return currentEntry as any
              } else if (
                !entry ||
                (entry instanceof File && entry.getModifier())
              ) {
                entry = currentEntry
              }
            }
          } else if (matchesModifier) {
            return currentEntry as any
          } else if (!entry || (entry instanceof File && entry.getModifier())) {
            entry = currentEntry
          }
        }
      }

      if (!entry) {
        return
      }

      // If this is the last segment, check for file or extension match
      if (segments.length === 0) {
        if (entry instanceof File) {
          if (extension) {
            const fileExtensions = Array.isArray(extension)
              ? extension
              : [extension]

            if (fileExtensions.includes(entry.getExtension() as Extension)) {
              return entry as any
            }
          } else {
            return entry as any
          }
        } else if (entry instanceof Directory) {
          const entries = await entry.getEntries({
            includeDuplicates: true,
            includeIndexAndReadme: true,
          })
          const directoryName = entry.getBaseName()

          // If extension is provided, check for a file with the extension
          if (extension) {
            const fileExtensions = Array.isArray(extension)
              ? extension
              : [extension]

            for (const subEntry of entries) {
              if (
                subEntry instanceof File &&
                subEntry.getBaseName() === entry.getBaseName() &&
                fileExtensions.includes(subEntry.getExtension() as Extension)
              ) {
                return subEntry as any
              }
            }
          }
          // Otherwise, check for a file with the same name as the directory or an index/readme file
          else {
            for (const subEntry of entries) {
              const name = subEntry.getBaseName()

              if (
                name === directoryName ||
                ['index', 'readme'].includes(name.toLowerCase())
              ) {
                return subEntry as any
              }
            }
          }
        }

        return
      }

      // If the entry is a directory, continue with the next segment
      if (entry instanceof Directory) {
        currentDirectory = entry
      } else {
        return
      }
    }

    return
  }

  /**
   * Get a file at the specified `path` and optional extensions.
   * An error will be thrown if the file is not found.
   */
  async getFileOrThrow<
    ExtensionType extends keyof FileTypes | string,
    const Extension extends ExtensionType | Extension[],
  >(
    path: string | string[],
    extension?: Extension | Extension[]
  ): Promise<
    Extension extends string
      ? IsJavaScriptLikeExtension<Extension> extends true
        ? JavaScriptFile<FileTypes[Extension]>
        : File<FileTypes>
      : File<FileTypes>
  > {
    const file = await this.getFile(path, extension)

    if (!file) {
      const normalizedPath = Array.isArray(path) ? joinPaths(...path) : path
      const normalizedExtension = Array.isArray(extension)
        ? extension
        : [extension]

      throw new Error(
        `[renoun] File not found at path "${normalizedPath}" with extension${normalizedExtension.length > 1 ? 's' : ''}: ${normalizedExtension.join(',')}`
      )
    }

    return file as any
  }

  /** Get the directory containing this directory. */
  getParent() {
    return this.#directory
  }

  /** Get a directory at the specified `path`. */
  async getDirectory(
    path: string | string[]
  ): Promise<Directory<FileTypes> | undefined> {
    const segments = Array.isArray(path)
      ? path.slice(0)
      : path.split('/').filter(Boolean)
    let currentDirectory = this as Directory<FileTypes>

    while (segments.length > 0) {
      const currentSegment = createSlug(segments.shift()!, this.#pathCasing)
      const allEntries = await currentDirectory.getEntries({
        includeDuplicates: true,
        includeTsConfigIgnoredFiles: true,
      })
      let entry: FileSystemEntry<FileTypes> | undefined

      for (const currentEntry of allEntries) {
        const baseSegment = createSlug(
          currentEntry.getBaseName(),
          this.#pathCasing
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
        return undefined
      }

      currentDirectory = entry
    }

    return currentDirectory
  }

  /**
   * Get a directory at the specified `path`. An error will be thrown if the
   * directory is not found.
   */
  async getDirectoryOrThrow(
    path: string | string[]
  ): Promise<Directory<FileTypes>> {
    const directory = await this.getDirectory(path)

    if (!directory) {
      throw new Error(
        path
          ? `[renoun] Directory not found at path "${joinPaths(...path)}"`
          : `[renoun] Parent directory not found`
      )
    }

    return directory
  }

  /** Get a file or directory at the specified `path`. Files will be prioritized over directories. */
  async getEntry(
    path: string | string[]
  ): Promise<FileSystemEntry<FileTypes> | undefined> {
    const file = await this.getFile(path)

    if (file) {
      return file
    }

    const directory = await this.getDirectory(path)

    if (directory) {
      return directory
    }
  }

  /** Get a file or directory at the specified `path`. An error will be thrown if the entry is not found. */
  async getEntryOrThrow(
    path: string | string[]
  ): Promise<FileSystemEntry<FileTypes>> {
    const entry = await this.getEntry(path)

    if (!entry) {
      throw new Error(
        `[renoun] Entry not found at path "${joinPaths(...path)}"`
      )
    }

    return entry
  }

  /**
   * Retrieves all entries (files and directories) within the current directory
   * that are not excluded by Git ignore rules or the closest `tsconfig` file.
   * Additionally, `index` and `readme` files are excluded by default.
   */
  async getEntries(options?: {
    recursive?: boolean
    includeIndexAndReadme?: boolean
    includeDuplicates?: boolean
    includeGitIgnoredFiles?: boolean
    includeTsConfigIgnoredFiles?: boolean
  }): Promise<
    Include extends string
      ? FileWithExtension<FileTypes, ExtractFilePatternExtension<Include>>[]
      : Include extends EntryInclude<infer FilteredEntry, FileTypes>
        ? FilteredEntry[]
        : FileSystemEntry<FileTypes>[]
  > {
    const fileSystem = this.getFileSystem()
    const directoryEntries = await fileSystem.readDirectory(this.#path)
    const entriesMap = new Map<string, FileSystemEntry<FileTypes>>()
    const thisDirectory = this as Directory<any, any, any>
    const directoryBaseName = this.getBaseName()
    const nextDepth = this.#depth + 1

    for (const entry of directoryEntries) {
      const shouldSkipIndexOrReadme = options?.includeIndexAndReadme
        ? false
        : ['index', 'readme'].some((name) =>
            entry.name.toLowerCase().startsWith(name)
          )

      if (
        shouldSkipIndexOrReadme ||
        (!options?.includeGitIgnoredFiles &&
          fileSystem.isFilePathGitIgnored(entry.path)) ||
        (!options?.includeTsConfigIgnoredFiles &&
          fileSystem.isFilePathExcludedFromTsConfig(
            entry.path,
            entry.isDirectory
          ))
      ) {
        continue
      }

      const entryKey =
        entry.isDirectory || options?.includeDuplicates
          ? entry.path
          : removeAllExtensions(entry.path)

      if (entriesMap.has(entryKey)) {
        continue
      }

      if (entry.isDirectory) {
        const directory = this.#duplicate({
          fileSystem,
          path: entry.path,
        })

        directory.#repository = this.#repository
        directory.#directory = thisDirectory
        directory.#depth = nextDepth

        if (this.#include) {
          if (await this.#shouldInclude(directory)) {
            entriesMap.set(entryKey, directory)
          }
        } else {
          entriesMap.set(entryKey, directory)
        }

        if (options?.recursive) {
          const nestedEntries = await directory.getEntries(options)
          for (const nestedEntry of nestedEntries) {
            entriesMap.set(nestedEntry.getPath(), nestedEntry)
          }
        }
      } else if (entry.isFile) {
        const extension = extensionName(entry.name).slice(1)
        const loader = this.#loaders?.[extension] as FileLoader<FileTypes[any]>
        const file =
          loader || isJavaScriptLikeExtension(extension)
            ? new JavaScriptFile({
                path: entry.path,
                depth: nextDepth,
                directory: thisDirectory,
                pathCasing: this.#pathCasing,
                loader,
              })
            : new File({
                path: entry.path,
                depth: nextDepth,
                directory: thisDirectory,
                pathCasing: this.#pathCasing,
              })

        if (
          !options?.includeDuplicates &&
          file.getBaseName() === directoryBaseName
        ) {
          continue
        }

        if (
          this.#include &&
          !(await this.#shouldInclude(file as FileSystemEntry<FileTypes>))
        ) {
          continue
        }

        entriesMap.set(entryKey, file)
      }
    }

    const entries = Array.from(
      entriesMap.values()
    ) as FileSystemEntry<FileTypes>[]

    if (this.#sort) {
      try {
        const entryCount = entries.length
        for (let outerIndex = 0; outerIndex < entryCount; outerIndex++) {
          for (
            let currentIndex = 0;
            currentIndex < entryCount - outerIndex - 1;
            currentIndex++
          ) {
            const a = entries[currentIndex]
            const b = entries[currentIndex + 1]
            const comparison = await this.#sort(a, b)

            if (comparison > 0) {
              ;[entries[currentIndex], entries[currentIndex + 1]] = [b, a]
            }
          }
        }
      } catch (error) {
        const badge = '[renoun] '

        if (error instanceof Error && error.message.includes(badge)) {
          throw new Error(
            `[renoun] Error occurred while sorting entries for directory at "${
              this.#path
            }". \n\n${error.message.slice(badge.length)}`
          )
        }

        throw error
      }
    }

    return entries as any
  }

  /** Get the previous and next sibling entries (files or directories) of the parent directory. */
  async getSiblings<
    GroupFileTypes extends Record<string, any> = FileTypes,
  >(options?: {
    entryGroup?: EntryGroup<FileSystemEntry<any>[], GroupFileTypes>
  }): Promise<
    [
      FileSystemEntry<FileTypes> | undefined,
      FileSystemEntry<FileTypes> | undefined,
    ]
  > {
    let entries: FileSystemEntry<FileTypes>[]

    if (options?.entryGroup) {
      entries = await options.entryGroup.getEntries({ recursive: true })
    } else if (this.#directory) {
      entries = await this.#directory.getEntries()
    } else {
      return [undefined, undefined]
    }

    const path = this.getPath()
    const index = entries.findIndex(
      (entryToCompare) => entryToCompare.getPath() === path
    )
    const previous = index > 0 ? entries[index - 1] : undefined
    const next = index < entries.length - 1 ? entries[index + 1] : undefined

    return [previous, next]
  }

  /** Get the slug of the directory. */
  getSlug() {
    return createSlug(this.getName(), this.#pathCasing)
  }

  /** Get the base name of the directory. */
  getName() {
    return this.getBaseName()
  }

  /** Get the base name of the directory. */
  getBaseName() {
    return removeOrderPrefixes(baseName(this.#path))
  }

  /** The directory name formatted as a title. */
  getTitle() {
    return formatNameAsTitle(this.getName())
  }

  /** Get a URL-friendly path to the directory. */
  getPath(options?: { includeBasePath?: boolean }) {
    const includeBasePath = options?.includeBasePath ?? true
    const fileSystem = this.getFileSystem()
    const path = fileSystem.getPath(
      this.#path,
      includeBasePath ? { basePath: this.#basePath } : undefined
    )

    if (this.#pathCasing === 'none') {
      return path
    }

    const segments = path.split('/')

    for (let index = 0; index < segments.length; index++) {
      segments[index] = createSlug(segments[index], this.#pathCasing)
    }

    return segments.join('/')
  }

  /** Get the path segments to the directory. */
  getPathSegments(options?: { includeBasePath?: boolean }) {
    const includeBasePath = options?.includeBasePath ?? true

    return this.getPath({ includeBasePath }).split('/').filter(Boolean)
  }

  /** Get the configured base path of the directory. */
  getBasePath() {
    return this.#basePath
  }

  /** Get the relative path of the directory. */
  getRelativePath() {
    return this.getFileSystem().getRelativePath(this.#path)
  }

  /** Get the relative path of the directory to the workspace. */
  getRelativePathToWorkspace() {
    return this.getFileSystem().getRelativePathToWorkspace(this.#path)
  }

  /** Get the absolute path of the directory. */
  getAbsolutePath() {
    return this.getFileSystem().getAbsolutePath(this.#path)
  }

  /** Get the URL to the directory source code for the configured git repository. */
  getRepositoryUrl(options?: Omit<GetDirectoryUrlOptions, 'path'>) {
    const repository = this.getRepository()
    const fileSystem = this.getFileSystem()

    return repository.getDirectoryUrl({
      path: fileSystem.getRelativePathToWorkspace(this.#path),
      ...options,
    })
  }

  /** Get the URI to the directory source code for the configured editor. */
  getEditorUri() {
    return getEditorUri({ path: this.getAbsolutePath() })
  }

  /** Get the first local git commit date of the directory. */
  async getFirstCommitDate() {
    const gitMetadata = await getLocalGitFileMetadata(this.#path)
    return gitMetadata.firstCommitDate
  }

  /** Get the last local git commit date of the directory. */
  async getLastCommitDate() {
    const gitMetadata = await getLocalGitFileMetadata(this.#path)
    return gitMetadata.lastCommitDate
  }

  /** Get the local git authors of the directory. */
  async getAuthors() {
    const gitMetadata = await getLocalGitFileMetadata(this.#path)
    return gitMetadata.authors
  }

  /** Checks if this directory contains the provided entry. */
  hasEntry(
    entry: FileSystemEntry<any> | undefined
  ): entry is FileSystemEntry<FileTypes> {
    if (entry === undefined) {
      return false
    }

    let directory = entry.getParent()

    while (directory) {
      if (directory === this) {
        return true
      }
      directory = directory.getParent()
    }

    return false
  }

  /** Checks if this directory contains the provided file. */
  hasFile<
    ExtensionType extends keyof FileTypes | string,
    const Extension extends ExtensionType | Extension[],
  >(
    entry: FileSystemEntry<any> | undefined,
    extension?: Extension | Extension[]
  ): entry is FileWithExtension<FileTypes, Extension> {
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

type LoadersFromEntries<Entries extends readonly FileSystemEntry<any>[]> =
  Entries extends readonly [infer First, ...infer Rest]
    ? First extends FileSystemEntry<infer FileTypes>
      ? Rest extends readonly FileSystemEntry<any>[]
        ? FileTypes & LoadersFromEntries<Rest>
        : FileTypes
      : never
    : {}

/** Options for an `EntryGroup`. */
export interface EntryGroupOptions<Entries extends FileSystemEntry<any>[]> {
  entries: Entries
}

/** A group of file system entries. */
export class EntryGroup<
  const Entries extends FileSystemEntry<any>[] = FileSystemEntry<any>[],
  FileTypes extends Record<string, any> = LoadersFromEntries<Entries>,
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
    includeIndexAndReadme?: boolean
  }): Promise<Entries> {
    const allEntries: FileSystemEntry<any>[] = []

    async function findEntries(entries: FileSystemEntry<any>[]) {
      for (const entry of entries) {
        const lowerCaseBaseName = entry.getBaseName().toLowerCase()
        const shouldSkipIndexOrReadme = options?.includeIndexAndReadme
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
  ): Promise<FileSystemEntry<FileTypes> | undefined> {
    const normalizedPath = Array.isArray(path)
      ? path
      : path.split('/').filter(Boolean)
    const rootPath = normalizedPath.at(0)

    for (const entry of this.#entries) {
      const baseName = entry.getBaseName()
      const isRootDirectory = baseName === '.'

      if (isRootDirectory || baseName === rootPath) {
        if (entry instanceof Directory) {
          const directoryEntry = await entry.getEntry(
            isRootDirectory ? normalizedPath : normalizedPath.slice(1)
          )

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
  }

  /** Get an entry in the group by its path or throw an error if not found. */
  async getEntryOrThrow(
    /** The path to the entry excluding leading numbers. */
    path: string | string[]
  ): Promise<FileSystemEntry<FileTypes>> {
    const entry = await this.getEntry(path)

    if (!entry) {
      throw new Error(`[renoun] Entry not found at path: ${path}`)
    }

    return entry
  }

  /** Get a file at the specified path and optional extension(s). */
  async getFile<const Extension extends string | undefined = undefined>(
    /** The path to the entry excluding leading numbers and the extension. */
    path: string | string[],

    /** The extension or extensions to match. */
    extension?: Extension | Extension[]
  ): Promise<
    | (Extension extends string
        ? IsJavaScriptLikeExtension<Extension> extends true
          ? JavaScriptFile<FileTypes[Extension]>
          : File<FileTypes>
        : File<FileTypes>)
    | undefined
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
          const directoryFile = (await entry.getFile(
            isRootDirectory ? normalizedPath : normalizedPath.slice(1),
            extension as any
          )) as any

          if (directoryFile) {
            return directoryFile
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
  }

  /** Get a file at the specified path and optional extension(s), or throw an error if not found. */
  async getFileOrThrow<Extension extends string | undefined = undefined>(
    /** The path to the entry excluding leading numbers and the extension. */
    path: string | string[],

    /** The extension or extensions to match. */
    extension?: Extension | Extension[]
  ): Promise<
    Extension extends string
      ? IsJavaScriptLikeExtension<Extension> extends true
        ? JavaScriptFile<FileTypes[Extension]>
        : File<FileTypes>
      : File<FileTypes>
  > {
    const file = await this.getFile(path, extension)

    if (!file) {
      const normalizedPath = Array.isArray(path) ? joinPaths(...path) : path
      const normalizedExtension = Array.isArray(extension)
        ? extension
        : [extension]
      const extensionMessage = extension
        ? ` with extension${normalizedExtension.length > 1 ? 's' : ''}`
        : ''

      throw new Error(
        `[renoun] File not found at path "${normalizedPath}"${extensionMessage}: ${normalizedExtension.join(',')}`
      )
    }

    return file as any
  }

  /** Get a directory at the specified path. */
  async getDirectory(
    /** The path to the entry excluding leading numbers. */
    path: string | string[]
  ): Promise<Directory<FileTypes> | undefined> {
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
  }

  /** Get a directory at the specified path or throw an error if not found. */
  async getDirectoryOrThrow(
    path: string | string[]
  ): Promise<Directory<FileTypes>> {
    const directory = await this.getDirectory(path)

    if (!directory) {
      throw new Error(`[renoun] Directory not found at path: ${path}`)
    }

    return directory
  }
}

/** Determines if a `FileSystemEntry` is a `Directory`. */
export function isDirectory<FileTypes extends Record<string, any>>(
  entry: FileSystemEntry<FileTypes>
): entry is Directory<FileTypes> {
  return entry instanceof Directory
}

/** Determines the type of a `FileSystemEntry` based on its extension. */
export type FileWithExtension<
  FileTypes extends Record<string, any>,
  Extension = LoadersToExtensions<FileTypes>,
> = Extension extends string
  ? IsJavaScriptLikeExtension<Extension> extends true
    ? JavaScriptFile<FileTypes[Extension]>
    : File<FileTypes>
  : Extension extends string[]
    ? HasJavaScriptLikeExtensions<Extension> extends true
      ? JavaScriptFile<FileTypes[Extension[number]]>
      : File<FileTypes>
    : File<FileTypes>

type StringUnion<Type> = Extract<Type, string> | (string & {})

/** Resolves valid extension patterns from an object of loaders. */
type LoadersToExtensions<
  DirectoryLoaders extends FileLoaders,
  ExtensionUnion = StringUnion<keyof DirectoryLoaders>,
> = ExtensionUnion | ExtensionUnion[]

/**
 * Determines if a `FileSystemEntry` is a `File` and optionally narrows the
 * result based on the provided extensions.
 */
export function isFile<FileTypes extends Record<string, any>>(
  entry: FileSystemEntry<FileTypes>
): entry is File<FileTypes>

export function isFile<
  FileTypes extends Record<string, any>,
  const Extension extends StringUnion<keyof FileTypes>,
>(
  entry: FileSystemEntry<FileTypes>,
  extension: Extension
): entry is FileWithExtension<FileTypes, Extension>

export function isFile<
  FileTypes extends Record<string, any>,
  const Extensions extends readonly StringUnion<keyof FileTypes>[],
>(
  entry: FileSystemEntry<FileTypes>,
  extensions: Extensions
): entry is FileWithExtension<FileTypes, Extensions[number]>

export function isFile(
  entry: any,
  extension?: any
): entry is FileWithExtension<any, any> {
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
export function isJavaScriptFile<FileTypes extends Record<string, any>>(
  entry: FileSystemEntry<FileTypes>
): entry is JavaScriptFile<FileTypes> {
  return entry instanceof JavaScriptFile
}
