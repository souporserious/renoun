import * as React from 'react'
import { getFileExportMetadata } from '../project/client.js'
import { getEditPath } from '../utils/get-edit-path.js'
import { getGitMetadata } from '../utils/get-git-metadata.js'
import {
  baseName,
  ensureRelativePath,
  extensionName,
  join,
  relative,
  removeExtension,
  removeOrderPrefixes,
} from '../utils/path.js'
import type { SymbolFilter } from '../utils/resolve-type.js'
import type { FileSystem } from './FileSystem.js'
import { NodeFileSystem } from './NodeFileSystem.js'
import {
  isJavaScriptLikeExtension,
  type HasJavaScriptLikeExtensions,
  type IsJavaScriptLikeExtension,
  type JavaScriptLikeExtensions,
} from './is-javascript-like-extension.js'

/** A directory or file entry. */
export type FileSystemEntry<
  Types extends ExtensionTypes = ExtensionTypes,
  HasModule extends boolean = false,
> = Directory<Types, HasModule> | File<Types, HasModule>

/** Options for a file in the file system. */
export interface FileOptions {
  path: string
  depth: number
  directory: Directory<any, any>
  entryGroup?: EntryGroup<FileSystemEntry<any, any>[]>
}

/** A file in the file system. */
export class File<
  Types extends ExtensionTypes = ExtensionTypes,
  HasModule extends boolean = false,
> {
  #path: string
  #depth: number
  #directory: Directory<Types, HasModule>
  #entryGroup?: EntryGroup<FileSystemEntry<Types, HasModule>[]>

  constructor(options: FileOptions) {
    this.#path = options.path
    this.#depth = options.depth
    this.#directory = options.directory
    this.#entryGroup = options.entryGroup
  }

  /** Duplicate the file with the same initial options. */
  duplicate(options?: {
    entryGroup: EntryGroup<FileSystemEntry<Types, HasModule>[]>
  }): File<Types, HasModule> {
    return new File({
      directory: this.#directory,
      path: this.#path,
      depth: this.#depth,
      ...options,
    })
  }

  /** Get the directory containing this file. */
  async getDirectory(): Promise<Directory<Types, HasModule>> {
    return this.#directory
  }

  /** Get the depth of the file starting from the root directory. */
  getDepth() {
    return this.#depth
  }

  /**
   * Get the base name of the file excluding the extension. The directory name
   * will be used if the file is an index or readme file.
   */
  getName() {
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

  /** Get the base name of the file excluding the extension. */
  getBaseName() {
    return removeOrderPrefixes(baseName(this.#path, extensionName(this.#path)))
  }

  /** Get the extension of the file. */
  getExtension() {
    return extensionName(this.#path).slice(1)
  }

  /** Get the path of the file. */
  getPath(options: { includeBasePath?: boolean } = { includeBasePath: true }) {
    const fileSystem = this.#directory.getFileSystem()
    const basePath = this.#directory.getBasePath()

    return removeExtension(
      fileSystem.getPath(
        this.#path,
        options.includeBasePath ? { basePath } : undefined
      )
    )
  }

  /** Get the path segments of the file. */
  getPathSegments(
    options: { includeBasePath?: boolean } = { includeBasePath: true }
  ) {
    return this.getPath(options).split('/').filter(Boolean)
  }

  /** Get the relative file system path of the file. */
  getRelativePath() {
    return this.#directory.getFileSystem().getRelativePath(this.#path)
  }

  /** Get the absolute file system path of the file. */
  getAbsolutePath() {
    const fileSystem = this.#directory.getFileSystem()
    return fileSystem.getAbsolutePath(this.#path)
  }

  /** Get the file path to the editor in local development and the configured git repository in production. */
  getEditPath() {
    return getEditPath(this.getAbsolutePath())
  }

  /** Get the created date of the file. */
  async getCreatedAt() {
    const gitMetadata = await getGitMetadata(this.#path)
    return gitMetadata.createdAt ? new Date(gitMetadata.createdAt) : undefined
  }

  /** Get the updated date of the file. */
  async getUpdatedAt() {
    const gitMetadata = await getGitMetadata(this.#path)
    return gitMetadata.updatedAt ? new Date(gitMetadata.updatedAt) : undefined
  }

  /** Get the git authors of the file. */
  async getAuthors() {
    const gitMetadata = await getGitMetadata(this.#path)
    return gitMetadata.authors
  }

  /**
   * Get the previous and next sibling entries (files or directories) of the parent directory.
   * If the file is an index or readme file, the siblings will be retrieved from the parent directory.
   */
  async getSiblings(): Promise<
    [
      File<Types, HasModule> | Directory<Types, HasModule> | undefined,
      File<Types, HasModule> | Directory<Types, HasModule> | undefined,
    ]
  > {
    const isIndexOrReadme = ['index', 'readme'].includes(
      this.getBaseName().toLowerCase()
    )
    if (isIndexOrReadme) {
      return this.#directory.getSiblings()
    }

    const entries = await (this.#entryGroup
      ? this.#entryGroup.getEntries({ recursive: true })
      : this.#directory.getEntries())
    const index = entries.findIndex((file) => {
      return file.getRelativePath() === this.getRelativePath()
    })
    const previous = index > 0 ? entries[index - 1] : undefined
    const next = index < entries.length - 1 ? entries[index + 1] : undefined

    return [previous, next]
  }
}

/** A JavaScript file export. */
export class JavaScriptFileExport<
  Exports extends ExtensionType = ExtensionType,
> {
  #name: string
  #file: JavaScriptFile<Exports>
  #position: number | undefined
  #metadata: Awaited<ReturnType<typeof getFileExportMetadata>> | undefined

  constructor(name: string, file: JavaScriptFile<Exports>) {
    this.#name = name
    this.#file = file
  }

  async #getPosition() {
    if (this.#position === undefined) {
      this.#position = await this.#file.getExportPosition(this.#name)
    }
    return this.#position
  }

  async #isNotStatic() {
    const position = await this.#getPosition()
    return position === undefined
  }

  async #getMetadata() {
    if (await this.#isNotStatic()) {
      return undefined
    }

    if (this.#metadata !== undefined) {
      return this.#metadata
    }

    const position = await this.#getPosition()
    const fileSystem = (await this.#file.getDirectory()).getFileSystem()

    this.#metadata = await fileSystem.getFileExportMetadata(
      this.#file.getAbsolutePath(),
      this.#name,
      position!
    )

    return this.#metadata
  }

  /** Get the name of the export. Default exports will use the file name or declaration name if available. */
  async getName() {
    if (await this.#isNotStatic()) {
      return this.#name === 'default' ? this.#file.getName() : this.#name
    }
    const metadata = await this.#getMetadata()
    return metadata?.name || this.#name
  }

  /** Get the base name of the export. */
  getBaseName() {
    return this.#name
  }

  /** Get the JS Doc description of the export. */
  async getDescription() {
    if (await this.#isNotStatic()) {
      return undefined
    }
    const metadata = await this.#getMetadata()
    return metadata?.jsDocMetadata?.description
  }

  /** Get the JS Doc tags of the export. */
  async getTags() {
    if (await this.#isNotStatic()) {
      return undefined
    }
    const metadata = await this.#getMetadata()
    return metadata?.jsDocMetadata?.tags
  }

  /** Get the environment of the export. */
  async getEnvironment() {
    if (await this.#isNotStatic()) {
      return undefined
    }
    const metadata = await this.#getMetadata()
    return metadata?.environment
  }

  /** Get the export path to the editor in local development and the configured git repository in production. */
  getEditPath() {
    // TODO: add position to the edit path as well
    return getEditPath(this.#file.getAbsolutePath())
  }

  /** Get the resolved type of the export. */
  async getType(filter?: SymbolFilter) {
    if (await this.#isNotStatic()) {
      throw new Error(
        `[renoun] Export can not be statically analyzed from source file at "${this.#file.getRelativePath()}".`
      )
    }

    const position = await this.#getPosition()
    const fileSystem = (await this.#file.getDirectory()).getFileSystem()

    return fileSystem.resolveTypeAtLocation(
      this.#file.getAbsolutePath(),
      position!,
      filter
    )
  }
}

/** A JavaScript file export with runtime value. */
export class JavaScriptFileExportWithRuntime<
  Value extends Exports[ExportName] = any,
  Exports extends ExtensionType = ExtensionType,
  ExportName extends Extract<keyof Exports, string> = Extract<
    keyof Exports,
    string
  >,
> extends JavaScriptFileExport<Exports> {
  #name: string
  #file: JavaScriptFileWithRuntime<Exports>
  #moduleGetters: Map<string, (path: string) => Promise<any>>

  constructor(
    name: string,
    file: JavaScriptFileWithRuntime<Exports>,
    moduleGetters: Map<string, (path: string) => Promise<any>>
  ) {
    super(name, file)
    this.#name = name
    this.#file = file
    this.#moduleGetters = moduleGetters
  }

  #getModule(path: string) {
    if (this.#moduleGetters.has('default')) {
      return this.#moduleGetters.get('default')!(path)
    }

    const extension = this.#file.getExtension()
    const getModule = this.#moduleGetters.get(extension)!

    return getModule(removeExtension(path))
  }

  /**
   * Get the runtime value of the export. An error will be thrown if the export
   * is not found or the configured schema validation for this file extension fails.
   */
  async getRuntimeValue(): Promise<Value> {
    if (this.#moduleGetters === undefined) {
      throw new Error(
        `[renoun] JavaScript file export "${String(this.#name)}" does not have a runtime value. The "getModule" function for the nearest Directory definition is not defined.`
      )
    }

    const exportName = this.getBaseName()
    const fileModule = await this.#getModule(this.#file.getRelativePath())
    const fileModuleExport = fileModule[this.getBaseName()]

    if (fileModuleExport === undefined) {
      throw new Error(
        `[renoun] JavaScript file export "${String(this.getBaseName())}" not found in ${this.#file.getAbsolutePath()}`
      )
    }

    const exportValue = this.#file.parseExportValue(
      exportName,
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
export interface JavaScriptFileOptions<Exports extends ExtensionType>
  extends FileOptions {
  schema?: ExtensionSchema<Exports>
}

/** A JavaScript file in the file system. */
export class JavaScriptFile<Exports extends ExtensionType> extends File {
  #exports = new Map<string, JavaScriptFileExport<Exports>>()
  #schema?: ExtensionSchema<Exports>

  constructor({ schema, ...fileOptions }: JavaScriptFileOptions<Exports>) {
    super(fileOptions)
    this.#schema = schema
  }

  /** Parse and validate an export value using the configured schema. */
  parseExportValue(name: string, value: any): any {
    if (!this.#schema) {
      return value
    }

    const parseExportValue = this.#schema[name]

    if (parseExportValue) {
      try {
        value = parseExportValue(value)
      } catch (error) {
        if (error instanceof Error) {
          throw new Error(
            `[renoun] Schema validation failed to parse export "${name}" at file path "${this.getRelativePath()}" errored with: ${error.message}`
          )
        }
      }
    }

    return value
  }

  /** Get all export names and positions from the JavaScript file. */
  async #getExports() {
    const fileSystem = (await this.getDirectory()).getFileSystem()
    return fileSystem.getFileExports(this.getAbsolutePath())
  }

  /** Get the start position of an export in the JavaScript file. */
  async getExportPosition(name: string) {
    const fileExports = await this.#getExports()
    const fileExport = fileExports.find(
      (exportMetadata) => exportMetadata.name === name
    )
    return fileExport?.position
  }

  /** Get all exports from the JavaScript file. */
  async getExports() {
    const fileExports = await this.#getExports()

    return fileExports.map((exportMetadata) =>
      this.getExport(exportMetadata.name as Extract<keyof Exports, string>)
    )
  }

  /**
   * Get or create a JavaScript file export by name.
   *
   * Note, exports are not always statically analyzable due to loaders like MDX
   * so an export instance will always be returned.
   */
  protected getOrCreateExport<
    ExportName extends Extract<keyof Exports, string>,
  >(
    name: ExportName,
    createExport: (name: ExportName) => JavaScriptFileExport<Exports>
  ): JavaScriptFileExport<Exports> {
    if (this.#exports.has(name)) {
      return this.#exports.get(name)!
    }

    const fileExport = createExport(name)
    this.#exports.set(name, fileExport)

    return fileExport
  }

  /**
   * Get a JavaScript file export by name.
   *
   * Note, exports are not always statically analyzable due to bundler transformations
   * so an export instance will always be returned.
   */
  getExport<ExportName extends Extract<keyof Exports, string>>(
    name: ExportName
  ): JavaScriptFileExport<Exports> {
    return this.getOrCreateExport(
      name,
      (exportName) => new JavaScriptFileExport(exportName, this)
    )
  }
}

interface JavaScriptFileWithRuntimeOptions<Exports extends ExtensionType>
  extends JavaScriptFileOptions<Exports> {
  moduleGetters?: Map<string, (path: string) => Promise<any>>
}

/** A JavaScript file in the file system with runtime support. */
export class JavaScriptFileWithRuntime<
  Exports extends ExtensionType,
> extends JavaScriptFile<Exports> {
  #moduleGetters: Map<string, (path: string) => Promise<any>>

  constructor({
    moduleGetters,
    ...fileOptions
  }: JavaScriptFileWithRuntimeOptions<Exports> & {
    moduleGetters: Map<string, (path: string) => Promise<any>>
  }) {
    super(fileOptions)
    this.#moduleGetters = moduleGetters
  }

  #getModule(path: string) {
    if (this.#moduleGetters.has('default')) {
      return this.#moduleGetters.get('default')!(path)
    }

    const extension = this.getExtension()
    const getModule = this.#moduleGetters.get(extension)!

    return getModule(removeExtension(path))
  }

  /**
   * Get the runtime value of the export. An error will be thrown if the export
   * is not found or the configured schema validation for this file extension fails.
   */
  async getRuntimeValue<ExportName extends Extract<keyof Exports, string>>(
    name: ExportName
  ): Promise<Exports[ExportName]> {
    const exportName = this.getExport(name).getBaseName()
    const fileModule = await this.#getModule(this.getRelativePath())
    const fileModuleExport = fileModule[exportName]

    if (fileModuleExport === undefined) {
      throw new Error(
        `[renoun] JavaScript file export "${String(exportName)}" not found in ${this.getAbsolutePath()}`
      )
    }

    const exportValue = this.parseExportValue(exportName, fileModuleExport)

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

        return WrappedComponent as Exports[ExportName]
      }
    }

    return exportValue
  }

  /**
   * Get a JavaScript file export by name.
   *
   * Note, exports are not always statically analyzable due to bundler transformations
   * so an export instance will always be returned.
   */
  getExport<ExportName extends Extract<keyof Exports, string>>(
    name: ExportName
  ): JavaScriptFileExportWithRuntime<
    Exports[ExportName],
    Exports,
    Extract<keyof Exports, string>
  > {
    return this.getOrCreateExport(
      name,
      (exportName) =>
        new JavaScriptFileExportWithRuntime(
          exportName,
          this,
          this.#moduleGetters
        )
    ) as any
  }
}

/** An object representing file export values. */
export interface ExtensionType {
  [exportName: string]: any
}

/** Types associated with a specific file extension. */
export interface ExtensionTypes {
  [extension: string]: any
}

/** A function that validates and transforms export values. */
export type SchemaFunction<Value> = (value: Value) => any

/** A map of file export names to their respective schema function. */
export type ExtensionSchema<Exports extends ExtensionTypes> = {
  [ExportName in keyof Exports[string]]?: SchemaFunction<
    Exports[string][ExportName]
  >
}

/** Functions that validate and transform export values for specific extensions. */
export type ExtensionSchemas<Types extends ExtensionTypes> = {
  [Extension in keyof Types]?: ExtensionSchema<Types[Extension]>
}

/** The options for a `Directory`. */
interface DirectoryOptions<Types extends ExtensionTypes = ExtensionTypes> {
  /** The path to the directory in the file system. */
  path?: string

  /** The tsconfig.json file path to use for type checking and analysis. */
  tsConfigPath?: string

  /** The file system to use for reading directory entries. */
  fileSystem?: FileSystem

  /** The entry group containing this directory. */
  entryGroup?: EntryGroup<FileSystemEntry<Types>[]>
}

/** A directory containing files and subdirectories in the file system. */
export class Directory<
  Types extends ExtensionTypes = ExtensionTypes,
  HasModule extends boolean = false,
  Entry extends FileSystemEntry<Types, HasModule> = FileSystemEntry<
    Types,
    HasModule
  >,
> {
  #path: string
  #depth: number = -1
  #basePath?: string
  #tsConfigPath?: string
  #fileSystem: FileSystem | undefined
  #entryGroup?: EntryGroup<FileSystemEntry<Types, HasModule>[]> | undefined
  #directory?: Directory<any, any>
  #schemas: ExtensionSchemas<Types> = {}
  #moduleGetters?: Map<string, (path: string) => Promise<any>>
  #sortCallback?: (a: Entry, b: Entry) => Promise<number> | number
  #filterCallback?:
    | ((entry: FileSystemEntry<Types, HasModule>) => entry is Entry)
    | ((entry: FileSystemEntry<Types, HasModule>) => Promise<boolean> | boolean)

  constructor(path?: string)
  constructor(path?: DirectoryOptions<Types>)
  constructor(path?: any) {
    if (path === undefined) {
      this.#path = '.'
    } else if (typeof path === 'string') {
      this.#path = ensureRelativePath(path)
    } else {
      this.#path = ensureRelativePath(path.path)
      this.#tsConfigPath = path.tsConfigPath
      this.#fileSystem = path.fileSystem
      this.#entryGroup = path.entryGroup
    }
  }

  /** Duplicate the directory with the same initial options. */
  duplicate<
    Entry extends FileSystemEntry<Types, HasModule> = FileSystemEntry<
      Types,
      HasModule
    >,
  >(options?: DirectoryOptions<Types>): Directory<Types, HasModule, Entry> {
    const directory = new Directory<Types, HasModule, Entry>({
      path: this.#path,
      fileSystem: this.#fileSystem,
      ...options,
    })

    directory.#depth = this.#depth
    directory.#tsConfigPath = this.#tsConfigPath
    directory.#basePath = this.#basePath
    directory.#schemas = this.#schemas
    directory.#moduleGetters = this.#moduleGetters
    directory.#sortCallback = this.#sortCallback as any
    directory.#filterCallback = this.#filterCallback

    return directory
  }

  #withOptions(options: {
    basePath?: string
    fileSystem?: FileSystem
    entryGroup?: EntryGroup<FileSystemEntry<Types, HasModule>[]>
    directory?: Directory<any, any>
    schemas?: ExtensionSchemas<Types>
    moduleGetters?: Map<string, (path: string) => Promise<any>>
    sortCallback?: (a: Entry, b: Entry) => Promise<number> | number
    filterCallback?:
      | ((entry: FileSystemEntry<Types, HasModule>) => entry is Entry)
      | ((
          entry: FileSystemEntry<Types, HasModule>
        ) => Promise<boolean> | boolean)
  }) {
    const directory = new Directory<Types, HasModule, Entry>({
      path: this.#path,
    })

    directory.#depth = this.#depth
    directory.#tsConfigPath = this.#tsConfigPath
    directory.#basePath = options.basePath ?? this.#basePath
    directory.#fileSystem = options.fileSystem ?? this.#fileSystem
    directory.#entryGroup = options.entryGroup ?? this.#entryGroup
    directory.#schemas = options.schemas ?? this.#schemas
    directory.#moduleGetters = options.moduleGetters ?? this.#moduleGetters
    directory.#sortCallback = options.sortCallback ?? this.#sortCallback
    directory.#filterCallback = options.filterCallback ?? this.#filterCallback

    return directory
  }

  /** Returns a new `Directory` with a base path applied to all descendant entries. */
  withBasePath(basePath: string): Directory<Types, HasModule, Entry> {
    return this.#withOptions({ basePath })
  }

  /** Returns a new `Directory` with a module getter applied to all JavaScript files. */
  withModule(
    getModule: (path: string) => Promise<any>
  ): Directory<Types, true, Entry>

  /** Returns a new `Directory` with a module getter applied to files with the specified extension. */
  withModule(
    extension: string,
    getModule: (path: string) => Promise<any>
  ): Directory<Types, true, Entry>

  withModule(
    extension: string | ((path: string) => Promise<any>),
    getModule?: (path: string) => Promise<any>
  ): Directory<Types, true, Entry> {
    const moduleGetters = this.#moduleGetters ?? new Map()

    if (typeof extension === 'string') {
      moduleGetters.set(extension, getModule!)
    } else {
      if (moduleGetters.has('default')) {
        throw new Error(
          `[renoun] Module getter for this directory is already defined.`
        )
      }

      moduleGetters.set('default', extension)
    }

    return this.#withOptions({ moduleGetters })
  }

  /** Returns a new `Directory` with a narrowed type and filter applied to all descendant entries. */
  withFilter<FilteredEntry extends Entry>(
    filterCallback: (
      entry: FileSystemEntry<Types, HasModule>
    ) => entry is FilteredEntry
  ): Directory<Types, HasModule, FilteredEntry>

  withFilter<FilteredEntry extends Entry>(
    filterCallback: (
      entry: FileSystemEntry<Types, HasModule>
    ) => Promise<boolean> | boolean
  ): Directory<Types, HasModule, FilteredEntry>

  withFilter<FilteredEntry extends Entry>(
    filterCallback: (
      entry: FileSystemEntry<Types, HasModule>
    ) => Promise<boolean> | boolean
  ): Directory<Types, HasModule, FilteredEntry> {
    return this.#withOptions({ filterCallback }) as Directory<
      Types,
      HasModule,
      FilteredEntry
    >
  }

  /** Returns a new `Directory` with a sorting function applied to all descendant entries. */
  withSort(
    sortCallback: (a: Entry, b: Entry) => Promise<number> | number
  ): Directory<Types, HasModule, Entry> {
    return this.#withOptions({ sortCallback })
  }

  /** Configure schema for a specific extension. */
  withSchema<Extension extends keyof Types>(
    extension: Extension,
    schema: ExtensionSchemas<Types>[Extension]
  ): Directory<Types, HasModule, Entry> {
    if (this.#schemas[extension]) {
      throw new Error(
        `[renoun] Schema for extension "${String(extension)}" is already defined in the directory "${this.#path}".`
      )
    }

    return this.#withOptions({
      schemas: {
        ...this.#schemas,
        [extension]: schema,
      },
    })
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

  /** Get the depth of the directory starting from the root directory. */
  getDepth() {
    return this.#depth
  }

  /** Get a file at the specified `path` and optional extensions. */
  async getFile<
    Type extends keyof Types | (string & {}),
    const Extension extends Type | Type[],
  >(
    path: string | string[],
    extension?: Extension | Extension[]
  ): Promise<
    | (Extension extends string
        ? IsJavaScriptLikeExtension<Extension> extends true
          ? HasModule extends true
            ? JavaScriptFileWithRuntime<Types[Extension]>
            : JavaScriptFile<Types[Extension]>
          : File<Types>
        : File<Types>)
    | undefined
  > {
    const segments = Array.isArray(path)
      ? path.slice(0)
      : path.split('/').filter(Boolean)
    let currentDirectory: Directory<Types> = this as Directory<Types>
    let entry: FileSystemEntry<Types> | undefined

    while (segments.length > 0) {
      const currentSegment = segments.shift()
      const allEntries = await currentDirectory.getEntries({
        includeIndexAndReadme: true,
      })

      // Find the entry matching the current segment
      for (const currentEntry of allEntries) {
        if (currentEntry.getBaseName() === currentSegment) {
          entry = currentEntry
          break
        }
      }

      if (!entry) {
        return undefined
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
          // Check if `index` or `readme` exists in the directory
          const entries = await entry.getEntries({
            includeIndexAndReadme: true,
          })
          const targetFiles = ['index', 'readme']

          for (const subEntry of entries) {
            const name = subEntry.getBaseName().toLowerCase()
            if (targetFiles.includes(name)) {
              return subEntry as any
            }
          }
        }

        return undefined
      }

      // If the entry is a directory, continue with the next segment
      if (entry instanceof Directory) {
        currentDirectory = entry
      } else {
        return undefined
      }
    }

    return undefined
  }

  /**
   * Get a file at the specified `path` and optional extensions.
   * An error will be thrown if the file is not found.
   */
  async getFileOrThrow<
    Type extends keyof Types | (string & {}),
    const Extension extends Type | Type[],
  >(
    path: string | string[],
    extension?: Extension | Extension[]
  ): Promise<
    Extension extends string
      ? IsJavaScriptLikeExtension<Extension> extends true
        ? HasModule extends true
          ? JavaScriptFileWithRuntime<Types[Extension]>
          : JavaScriptFile<Types[Extension]>
        : File<Types>
      : File<Types>
  > {
    const file = await this.getFile(path, extension)

    if (!file) {
      const normalizedPath = Array.isArray(path) ? join(...path) : path
      const normalizedExtension = Array.isArray(extension)
        ? extension
        : [extension]

      throw new Error(
        `[renoun] File not found at path "${normalizedPath}" with extension${normalizedExtension.length > 1 ? 's' : ''}: ${normalizedExtension.join(',')}`
      )
    }

    return file as any
  }

  /** Get the parent directory or a directory at the specified `path`. */
  async getDirectory(
    path?: string | string[]
  ): Promise<Directory<Types, HasModule> | undefined> {
    if (path === undefined) {
      return this.#directory
    }

    const segments = Array.isArray(path)
      ? path.slice(0)
      : path.split('/').filter(Boolean)
    let currentDirectory: Directory<Types> = this as Directory<Types>

    while (segments.length > 0) {
      const currentSegment = segments.shift()
      const allEntries = await currentDirectory.getEntries()
      let entry: FileSystemEntry<Types> | undefined

      for (const currentEntry of allEntries) {
        if (
          currentEntry instanceof Directory &&
          currentEntry.getBaseName() === currentSegment
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
    path?: string | string[]
  ): Promise<Directory<Types, HasModule>> {
    const directory = await this.getDirectory(path)

    if (!directory) {
      throw new Error(
        path
          ? `[renoun] Directory not found at path "${join(...path)}"`
          : `[renoun] Parent directory not found`
      )
    }

    return directory
  }

  /** Get a file or directory at the specified `path`. Files will be prioritized over directories. */
  async getEntry(
    path: string | string[]
  ): Promise<FileSystemEntry<Types, HasModule> | undefined> {
    const file = await this.getFile(path)

    if (file) {
      return file
    }

    const directory = await this.getDirectory(path)

    if (directory) {
      return directory
    }

    return undefined
  }

  /** Get a file or directory at the specified `path`. An error will be thrown if the entry is not found. */
  async getEntryOrThrow(
    path: string | string[]
  ): Promise<FileSystemEntry<Types, HasModule>> {
    const entry = await this.getEntry(path)

    if (!entry) {
      throw new Error(`[renoun] Entry not found at path "${join(...path)}"`)
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
  }): Promise<Entry[]> {
    const fileSystem = this.getFileSystem()
    const directoryEntries = await fileSystem.readDirectory(this.#path)
    const entriesMap = new Map<string, FileSystemEntry<any>>()
    const thisDirectory = this as Directory<Types>
    const nextDepth = this.#depth + 1

    for (const entry of directoryEntries) {
      const shouldSkipIndexOrReadme = options?.includeIndexAndReadme
        ? false
        : ['index', 'readme'].some((name) =>
            entry.name.toLowerCase().startsWith(name)
          )

      if (
        shouldSkipIndexOrReadme ||
        fileSystem.isFilePathGitIgnored(entry.path) ||
        fileSystem.isFilePathExcludedFromTsConfig(entry.path)
      ) {
        continue
      }

      if (entry.isDirectory) {
        const directory = this.duplicate({
          fileSystem,
          path: entry.path,
          entryGroup: this.#entryGroup,
        })

        directory.#directory = thisDirectory
        directory.#depth = nextDepth

        if (options?.recursive) {
          const nestedEntries = await directory.getEntries(options)
          for (const nestedEntry of nestedEntries) {
            entriesMap.set(nestedEntry.getRelativePath(), nestedEntry)
          }
        }

        if (this.#filterCallback) {
          if (await this.#filterCallback(directory)) {
            entriesMap.set(entry.path, directory)
          }
        } else {
          entriesMap.set(entry.path, directory)
        }
      } else if (entry.isFile) {
        const extension = extensionName(entry.name).slice(1)
        const file = isJavaScriptLikeExtension(extension)
          ? this.#moduleGetters
            ? new JavaScriptFileWithRuntime<Types>({
                path: entry.path,
                depth: nextDepth,
                directory: thisDirectory,
                entryGroup: this.#entryGroup,
                moduleGetters: this.#moduleGetters,
                schema: this.#schemas[extension],
              })
            : new JavaScriptFile<Types>({
                path: entry.path,
                depth: nextDepth,
                directory: thisDirectory,
                entryGroup: this.#entryGroup,
                schema: this.#schemas[extension],
              })
          : new File({
              path: entry.path,
              depth: nextDepth,
              directory: thisDirectory,
              entryGroup: this.#entryGroup,
            })

        if (
          this.#filterCallback &&
          !(await this.#filterCallback(file as File<Types>))
        ) {
          continue
        }

        entriesMap.set(entry.path, file)
      }
    }

    const entries = Array.from(entriesMap.values()) as Entry[]

    if (this.#sortCallback) {
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
            const comparison = await this.#sortCallback(a, b)

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

    return entries
  }

  /** Get the previous and next sibling entries (files or directories) of the parent directory. */
  async getSiblings(): Promise<
    [
      FileSystemEntry<Types, HasModule> | undefined,
      FileSystemEntry<Types, HasModule> | undefined,
    ]
  > {
    let entries: FileSystemEntry<Types, HasModule>[] = []

    if (this.#entryGroup) {
      entries = await this.#entryGroup.getEntries({ recursive: true })
    } else if (this.#directory) {
      entries = await this.#directory.getEntries()
    } else {
      return [undefined, undefined]
    }

    const index = entries.findIndex((entryToCompare) => {
      return entryToCompare.getRelativePath() === this.getRelativePath()
    })
    const previous = index > 0 ? entries[index - 1] : undefined
    const next = index < entries.length - 1 ? entries[index + 1] : undefined

    return [previous, next]
  }

  /** Get the base name of the directory. */
  getName() {
    return this.getBaseName()
  }

  /** Get the base name of the directory. */
  getBaseName() {
    return removeOrderPrefixes(baseName(this.#path))
  }

  /** Get a URL-friendly path of the directory. */
  getPath(options: { includeBasePath?: boolean } = { includeBasePath: true }) {
    const fileSystem = this.getFileSystem()

    return fileSystem.getPath(
      this.#path,
      options.includeBasePath ? { basePath: this.#basePath } : undefined
    )
  }

  /** Get the path segments of the directory. */
  getPathSegments(
    options: { includeBasePath?: boolean } = { includeBasePath: true }
  ) {
    return this.getPath(options).split('/').filter(Boolean)
  }

  /** Get the configured base path of the directory. */
  getBasePath() {
    return this.#basePath
  }

  /** Get the relative path of the directory. */
  getRelativePath() {
    return this.getFileSystem().getRelativePath(this.#path)
  }

  /** Get the absolute path of the directory. */
  getAbsolutePath() {
    return this.getFileSystem().getAbsolutePath(this.#path)
  }

  /** Get the directory path to the editor in local development and the configured git repository in production. */
  getEditPath() {
    return getEditPath(this.getAbsolutePath())
  }

  /** Get the created date of the directory. */
  async getCreatedAt() {
    const gitMetadata = await getGitMetadata(this.#path)
    return gitMetadata.createdAt ? new Date(gitMetadata.createdAt) : undefined
  }

  /** Get the updated date of the directory. */
  async getUpdatedAt() {
    const gitMetadata = await getGitMetadata(this.#path)
    return gitMetadata.updatedAt ? new Date(gitMetadata.updatedAt) : undefined
  }

  /** Get the git authors of the directory. */
  async getAuthors() {
    const gitMetadata = await getGitMetadata(this.#path)
    return gitMetadata.authors
  }

  /** Returns a type guard that checks if this directory contains the provided entry. */
  async getHasEntry(entry: FileSystemEntry<any, boolean> | undefined) {
    let exists = false

    if (entry) {
      const path = entry.getPath({ includeBasePath: false })
      const directoryEntry = await this.getEntry(path)

      if (directoryEntry) {
        exists = true
      }
    }

    function hasEntry(
      entry: FileSystemEntry<any, boolean> | undefined
    ): entry is Entry {
      return exists
    }

    return hasEntry
  }

  /** Returns a type guard that check if this directory contains the provided file with a specific extension. */
  async getHasFile(entry: FileSystemEntry<any, boolean> | undefined) {
    const hasEntry = await this.getHasEntry(entry)

    function hasFileWith<
      Type extends keyof Types | (string & {}),
      const Extension extends Type | Type[],
    >(
      entry: FileSystemEntry<any, boolean> | undefined,
      extension?: Extension
    ): entry is FileWithExtension<Types, Extension, HasModule> {
      const extensions = Array.isArray(extension) ? extension : [extension]

      if (hasEntry(entry) && entry instanceof File) {
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

    return hasFileWith
  }
}

type InferExtensionTypes<Entries extends readonly FileSystemEntry<any>[]> =
  Entries extends readonly [infer First, ...infer Rest]
    ? First extends FileSystemEntry<infer Types>
      ? Rest extends readonly FileSystemEntry<any>[]
        ? Types & InferExtensionTypes<Rest>
        : Types
      : never
    : {}

/** Options for an `EntryGroup`. */
export interface EntryGroupOptions<Entries extends FileSystemEntry<any>[]> {
  entries: Entries
}

/** A group of file system entries. */
export class EntryGroup<
  const Entries extends FileSystemEntry<any>[] = FileSystemEntry<any>[],
  Types extends ExtensionTypes = InferExtensionTypes<Entries>,
> {
  #entries: Entries

  constructor(options: EntryGroupOptions<Entries>) {
    this.#entries = options.entries.map((entry) =>
      entry.duplicate({ entryGroup: this as any })
    ) as Entries
  }

  /** Get all entries in the group. */
  async getEntries(options?: {
    /** Include all entries in the group recursively. */
    recursive?: boolean

    /** Include index and readme files in the group. */
    includeIndexAndReadme?: boolean
  }): Promise<Entries> {
    const allEntries: FileSystemEntry<Types>[] = []

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
  ): Promise<FileSystemEntry<Types> | undefined> {
    const segments = Array.isArray(path)
      ? path
      : path.split('/').filter(Boolean)
    const [targetSegment, ...remainingSegments] = segments

    for (const entry of this.#entries) {
      if (entry instanceof Directory) {
        const entryBaseName = entry.getBaseName()

        if (entryBaseName === targetSegment) {
          if (remainingSegments.length === 0) {
            return entry
          }
          if (entry instanceof Directory) {
            return entry.getEntry(remainingSegments)
          }
          return undefined
        }

        const childEntries = await entry.getEntries()
        const childEntry = childEntries.find((childEntry) => {
          return childEntry.getBaseName() === targetSegment
        })

        if (childEntry) {
          if (remainingSegments.length === 0) {
            return childEntry
          }
          if (childEntry instanceof Directory) {
            return childEntry.getEntry(remainingSegments)
          }
        }
      } else {
        if (entry.getBaseName() === targetSegment) {
          if (remainingSegments.length === 0) {
            return entry
          }
          if (isDirectory(entry)) {
            return entry.getEntry(remainingSegments)
          }
        }
      }
    }

    return undefined
  }

  /** Get an entry in the group by its path or throw an error if not found. */
  async getEntryOrThrow(
    /** The path to the entry excluding leading numbers. */
    path: string | string[]
  ): Promise<FileSystemEntry<Types>> {
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
          ? JavaScriptFile<Types[Extension]>
          : File<Types>
        : File<Types>)
    | undefined
  > {
    const entry = await this.getEntry(path)

    if (entry instanceof File) {
      if (extension) {
        const entryExtension = entry.getExtension()
        const fileExtensions = Array.isArray(extension)
          ? extension
          : [extension]

        for (const fileExtension of fileExtensions) {
          if (entryExtension === fileExtension) {
            return entry as any
          }
        }

        return undefined
      }

      return entry as any
    }

    return undefined
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
        ? JavaScriptFile<Types[Extension]>
        : File<Types>
      : File<Types>
  > {
    const file = await this.getFile(path, extension)

    if (!file) {
      const normalizedPath = Array.isArray(path) ? join(...path) : path
      const normalizedExtension = Array.isArray(extension)
        ? extension
        : [extension]

      throw new Error(
        `[renoun] File not found at path "${normalizedPath}" with extension${normalizedExtension.length > 1 ? 's' : ''}: ${normalizedExtension.join(',')}`
      )
    }

    return file as any
  }

  /** Get a directory at the specified path. */
  async getDirectory(
    /** The path to the entry excluding leading numbers. */
    path: string | string[]
  ): Promise<Directory<Types> | undefined> {
    const entry = await this.getEntry(path)

    if (entry instanceof Directory) {
      return entry
    }
  }

  /** Get a directory at the specified path or throw an error if not found. */
  async getDirectoryOrThrow(
    /** The path to the entry excluding leading numbers. */
    path: string | string[]
  ): Promise<Directory<Types>> {
    const directory = await this.getDirectory(path)

    if (!directory) {
      throw new Error(`[renoun] Directory not found at path: ${path}`)
    }

    return directory
  }
}

/** Determines if a `FileSystemEntry` is a `Directory`. */
export function isDirectory<Types extends ExtensionTypes>(
  entry: FileSystemEntry<Types>
): entry is Directory<Types> {
  return entry instanceof Directory
}

/** Determines the type of a `FileSystemEntry` based on its extension. */
export type FileWithExtension<
  Types extends ExtensionTypes,
  Extension extends keyof Types | (keyof Types)[],
  HasModule extends boolean = false,
> = Extension extends string
  ? IsJavaScriptLikeExtension<Extension> extends true
    ? HasModule extends true
      ? JavaScriptFileWithRuntime<Types[Extension]>
      : JavaScriptFile<Types[Extension]>
    : File<Types>
  : Extension extends string[]
    ? HasJavaScriptLikeExtensions<Extension> extends true
      ? HasModule extends true
        ? JavaScriptFileWithRuntime<
            Types[Extract<Extension[number], JavaScriptLikeExtensions>]
          >
        : JavaScriptFile<
            Types[Extract<Extension[number], JavaScriptLikeExtensions>]
          >
      : File<Types>
    : File<Types>

/**
 * Determines if a `FileSystemEntry` is a `File` and optionally narrows the
 * result based on the provided extensions.
 */
export function isFile<
  Types extends ExtensionTypes,
  Type extends keyof Types | (string & {}),
  const Extension extends Type | Type[],
  HasModule extends boolean,
>(
  entry: FileSystemEntry<Types, HasModule>,
  extension?: Extension
): entry is FileWithExtension<Types, Extension, HasModule> {
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
export function isJavaScriptFile<HasModule extends boolean>(
  entry: FileSystemEntry<any, HasModule>
): entry is HasModule extends true
  ? JavaScriptFileWithRuntime<any>
  : JavaScriptFile<any> {
  return entry instanceof JavaScriptFile
}

/** Determines if a `FileSystemEntry` is a `JavaScriptFileWithRuntime`. */
export function isJavaScriptFileWithRuntime<Exports extends ExtensionTypes>(
  entry: FileSystemEntry<any, true>
): entry is JavaScriptFileWithRuntime<Exports> {
  return entry instanceof JavaScriptFileWithRuntime
}
