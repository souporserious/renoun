import {
  getFileExports,
  getFileExportMetadata,
  resolveTypeAtLocation,
} from '../project/client.js'
import { getEditPath } from '../utils/get-edit-path.js'
import { getGitMetadata } from '../utils/get-git-metadata.js'
import {
  baseName,
  extensionName,
  join,
  relative,
  removeExtension,
  removeOrderPrefixes,
} from '../utils/path.js'
import type { SymbolFilter } from '../utils/resolve-type.js'
import type { FileSystem } from './FileSystem.js'
import { NodeFileSystem } from './NodeFileSystem.js'
import { VirtualFileSystem } from './VirtualFileSystem.js'
import {
  isJavaScriptLikeExtension,
  type HasJavaScriptLikeExtensions,
  type IsJavaScriptLikeExtension,
  type JavaScriptLikeExtensions,
} from './is-javascript-like-extension.js'

export type FileSystemEntry<Types extends ExtensionTypes> =
  | Directory<Types>
  | File<Types>

interface FileOptions {
  directory: Directory<any>
  path: string
  absolutePath: string
}

/** A file in the file system. */
export class File<Types extends ExtensionTypes = ExtensionTypes> {
  #directory: Directory
  #path: string
  #absolutePath: string

  constructor(options: FileOptions) {
    this.#directory = options.directory
    this.#path = options.path
    this.#absolutePath = options.absolutePath
  }

  /** Narrow the file type based on its extension. */
  hasExtension<const Extension extends keyof Types | (keyof Types)[]>(
    extension: Extension
  ): this is FileWithExtension<Types, Extension> {
    const fileExtension = this.getExtension()

    if (extension instanceof Array) {
      for (const possibleExtension of extension) {
        if (fileExtension === possibleExtension) {
          return true
        }
      }
      return false
    }

    return fileExtension === extension
  }

  /** Get the directory containing this file. */
  getDirectory() {
    return this.#directory
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

  /** Get a URL-friendly path to the file. */
  getPath() {
    const fileSystem = this.#directory.getFileSystem()
    return fileSystem.getUrlPathRelativeTo(
      removeOrderPrefixes(removeExtension(this.#path))
    )
  }

  /** Get the path segments of the file. */
  getPathSegments() {
    const fileSystem = this.#directory.getFileSystem()
    const path = fileSystem.getUrlPathRelativeTo(
      removeExtension(this.#path),
      false
    )
    return path.split('/').filter(Boolean)
  }

  /** Get the relative path to the file. */
  getRelativePath() {
    return this.#path
  }

  /** Get the file path to the editor in local development and the configured git repository in production. */
  getEditPath() {
    return getEditPath(this.#absolutePath)
  }

  /** Get the path of the file relative to another path. */
  getPathRelativeTo(path: string) {
    return relative(path, this.#path)
  }

  /** Get the absolute path of the file. */
  getAbsolutePath() {
    return this.#absolutePath
  }

  async getCreatedAt() {
    const gitMetadata = await getGitMetadata(this.#path)
    return gitMetadata.createdAt ? new Date(gitMetadata.createdAt) : undefined
  }

  async getUpdatedAt() {
    const gitMetadata = await getGitMetadata(this.#path)
    return gitMetadata.updatedAt ? new Date(gitMetadata.updatedAt) : undefined
  }

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
      File<Types> | Directory<Types> | undefined,
      File<Types> | Directory<Types> | undefined,
    ]
  > {
    const isIndexOrReadme = ['index', 'readme'].includes(
      this.getBaseName().toLowerCase()
    )
    if (isIndexOrReadme) {
      return this.#directory.getSiblings()
    }

    const entries = await this.#directory.getEntries()
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
  Value extends Exports[ExportName] = any,
  Exports extends ExtensionType = ExtensionType,
  ExportName extends Extract<keyof Exports, string> = Extract<
    keyof Exports,
    string
  >,
> {
  #name: string
  #file: JavaScriptFile<Exports>
  #position: number | undefined
  #metadata: Awaited<ReturnType<typeof getFileExportMetadata>> | undefined
  #getModule?: (path: string) => Promise<any>

  constructor(
    name: string,
    file: JavaScriptFile<Exports>,
    getModule?: (path: string) => Promise<any>
  ) {
    this.#name = name
    this.#file = file
    this.#getModule = getModule
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
    const fileSystem = this.#file.getDirectory().getFileSystem()
    const isVirtualFileSystem = fileSystem instanceof VirtualFileSystem

    this.#metadata = await getFileExportMetadata(
      this.#file.getAbsolutePath(),
      this.#name,
      position!,
      { useInMemoryFileSystem: isVirtualFileSystem }
    )

    return this.#metadata
  }

  /** Get the name of the export. Default exports will use the declaration name if available or the file name. */
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
    const fileSystem = this.#file.getDirectory().getFileSystem()
    const isVirtualFileSystem = fileSystem instanceof VirtualFileSystem

    return resolveTypeAtLocation(
      this.#file.getAbsolutePath(),
      position!,
      filter,
      { useInMemoryFileSystem: isVirtualFileSystem }
    )
  }

  /**
   * Get the runtime value of the export. An error will be thrown if the export
   * is not found or the configured schema validation for this file extension fails.
   */
  async getRuntimeValue(): Promise<Value> {
    if (this.#getModule === undefined) {
      throw new Error(
        `[renoun] JavaScript file export "${String(this.#name)}" does not have a runtime value. The "getModule" function for the nearest Directory definition is not defined.`
      )
    }

    const exportName = this.getBaseName()
    const fileSystem = this.#file.getDirectory().getFileSystem()
    const fileModule = await this.#getModule(
      this.#file.getPathRelativeTo(fileSystem.getRootPath())
    )
    const fileModuleExport = fileModule[this.getBaseName()]

    if (fileModuleExport === undefined) {
      throw new Error(
        `[renoun] JavaScript file export "${String(this.getBaseName())}" not found in ${this.#file.getAbsolutePath()}`
      )
    }

    return this.#file.parseExportValue(exportName, fileModuleExport)
  }
}

interface JavaScriptFileOptions extends FileOptions {
  schema?: DirectoryOptions<any>['schema']
  tsConfigFilePath?: string
  isVirtualFileSystem?: boolean
  getModule?: (path: string) => Promise<any>
}

/** A JavaScript file in the file system. */
export class JavaScriptFile<Exports extends ExtensionType> extends File {
  #getModule?: (path: string) => Promise<any>
  #schema?: DirectoryOptions<any>['schema']
  #tsConfigFilePath?: string
  #isVirtualFileSystem: boolean

  constructor({
    getModule,
    schema,
    tsConfigFilePath,
    isVirtualFileSystem = false,
    ...fileOptions
  }: JavaScriptFileOptions) {
    super(fileOptions)
    this.#getModule = getModule
    this.#schema = schema
    this.#tsConfigFilePath = tsConfigFilePath
    this.#isVirtualFileSystem = isVirtualFileSystem
  }

  /** Parse and validate an export value using the configured schema. */
  parseExportValue(name: string, value: any): any {
    if (!this.#schema) {
      return value
    }

    const extensionSchema = this.#schema[this.getExtension()]

    if (extensionSchema) {
      const parseExportValue = extensionSchema[name]

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
    }

    return value
  }

  /** Get all export names and positions from the JavaScript file. */
  async getExports() {
    return getFileExports(this.getAbsolutePath(), {
      tsConfigFilePath: this.#tsConfigFilePath,
      useInMemoryFileSystem: this.#isVirtualFileSystem,
    })
  }

  /** Get the start position of an export in the JavaScript file. */
  async getExportPosition(name: string) {
    const fileExports = await this.getExports()
    const fileExport = fileExports.find(
      (exportMetadata) => exportMetadata.name === name
    )
    return fileExport?.position
  }

  /**
   * Get a JavaScript file export by name. Note, an export will always be returned.
   * This is due to exports not always being statically analyzable due to loaders like MDX.
   */
  getExport<ExportName extends Extract<keyof Exports, string>>(
    name: ExportName
  ): JavaScriptFileExport<
    Exports[ExportName],
    Exports,
    Extract<keyof Exports, string>
  > {
    return new JavaScriptFileExport(name, this, this.#getModule)
  }
}

interface ExtensionType {
  [exportName: string]: any
}

/** Types that are associated with a file extension. */
interface ExtensionTypes {
  [extension: string]: ExtensionType
}

type SchemaFunction<Value> = (value: Value) => any

interface ExtensionSchema {
  [exportName: string]: SchemaFunction<any>
}

/** Functions that validate and transform export values for specific extensions. */
type ExtensionSchemas<Types extends ExtensionTypes> = {
  [Extension in keyof Types]?: {
    [ExportName in keyof Types[Extension]]?: SchemaFunction<
      Types[Extension][ExportName]
    >
  }
}

interface DirectoryOptions<Types extends ExtensionTypes = ExtensionTypes> {
  path?: string
  basePath?: string
  fileSystem?: FileSystem
  schema?: ExtensionSchemas<Types>
  getModule?: (path: string) => Promise<any>
}

/** A directory containing files and subdirectories in the file system. */
export class Directory<
  Types extends ExtensionTypes = ExtensionTypes,
  Entry extends FileSystemEntry<Types> = FileSystemEntry<Types>,
> {
  #path: string
  #basePath?: string
  #fileSystem: FileSystem | undefined
  #directory?: Directory<any, any>
  #schema?: ExtensionSchemas<Types>
  #getModule?: (path: string) => Promise<any>
  #sortCallback?: (a: Entry, b: Entry) => Promise<number> | number
  #filterCallback?:
    | ((entry: FileSystemEntry<Types>) => entry is Entry)
    | ((entry: FileSystemEntry<Types>) => Promise<boolean> | boolean)

  constructor(options: DirectoryOptions<Types> = {}) {
    this.#path = options.path
      ? options.path.startsWith('.')
        ? options.path
        : join('.', options.path)
      : '.'
    this.#basePath = options.basePath
    this.#fileSystem = options.fileSystem
    this.#schema = options.schema
    this.#getModule = options.getModule
  }

  getFileSystem() {
    if (this.#fileSystem) {
      return this.#fileSystem
    }
    this.#fileSystem = new NodeFileSystem({
      rootPath: this.#path,
      basePath: this.#basePath,
    })
    return this.#fileSystem
  }

  /** Set a filter to exclude entries from the directory. */
  protected setFilterCallback(
    filter:
      | ((entry: FileSystemEntry<Types>) => entry is Entry)
      | ((entry: FileSystemEntry<Types>) => Promise<boolean> | boolean)
  ) {
    this.#filterCallback = filter
  }

  /** Returns a new `Directory` with a narrowed type and filter applied to all descendant entries. */
  filter<FilteredEntry extends Entry>(
    filterFn: (entry: FileSystemEntry<Types>) => entry is FilteredEntry
  ): Directory<Types, FilteredEntry>
  filter<FilteredEntry extends Entry>(
    filterFn: (entry: FileSystemEntry<Types>) => Promise<boolean> | boolean
  ): Directory<Types, Entry>
  filter<FilteredEntry extends Entry>(
    filterFn: (entry: FileSystemEntry<Types>) => Promise<boolean> | boolean
  ): Directory<Types, Entry | FilteredEntry> {
    const filteredDirectory = new Directory<Types, Entry | FilteredEntry>({
      path: this.#path,
      basePath: this.#basePath,
      fileSystem: this.#fileSystem,
      schema: this.#schema,
      getModule: this.#getModule,
    })

    filteredDirectory.setDirectory(this)
    filteredDirectory.setFilterCallback(filterFn)
    if (this.#sortCallback) {
      filteredDirectory.setSortCallback(this.#sortCallback)
    }

    return filteredDirectory
  }

  /** Set a sorting function for directory entries. */
  protected setSortCallback<Entry extends FileSystemEntry<Types>>(
    sortCallback: (a: Entry, b: Entry) => Promise<number> | number
  ) {
    this.#sortCallback = sortCallback as (
      a: FileSystemEntry<Types>,
      b: FileSystemEntry<Types>
    ) => Promise<number> | number
  }

  /** Returns a new `Directory` with a sorting function applied to all descendant entries. */
  sort(
    sortCallback: (a: Entry, b: Entry) => Promise<number> | number
  ): Directory<Types, Entry> {
    const sortedDirectory = new Directory<Types, Entry>({
      path: this.#path,
      basePath: this.#basePath,
      fileSystem: this.#fileSystem,
      schema: this.#schema,
      getModule: this.#getModule,
    })

    sortedDirectory.setDirectory(this)
    sortedDirectory.setSortCallback(sortCallback)
    if (this.#filterCallback) {
      sortedDirectory.setFilterCallback(this.#filterCallback)
    }

    return sortedDirectory
  }

  /** Get a file at the specified `path` and optional extensions. */
  async getFile<Extension extends string | undefined = undefined>(
    path: string | string[],
    extension?: Extension | Extension[]
  ): Promise<
    | (Extension extends string
        ? IsJavaScriptLikeExtension<Extension> extends true
          ? JavaScriptFile<Types[Extension]>
          : File<Types>
        : File<Types>)
    | undefined
  > {
    const segments = Array.isArray(path) ? path.slice(0) : path.split('/')
    let currentDirectory: Directory<Types> = this as Directory<Types>
    let entry: FileSystemEntry<Types> | undefined

    while (segments.length > 0) {
      const currentSegment = segments.shift()
      const allEntries = await currentDirectory.getEntries({
        includeIndexAndReadme: true,
      })

      // Find the entry matching the current segment
      entry = allEntries.find((entry) => entry.getBaseName() === currentSegment)

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
  async getFileOrThrow<Extension extends string | undefined = undefined>(
    path: string | string[],
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
      throw new Error(
        `[renoun] File not found at path "${normalizedPath}" with extension "${extension}"`
      )
    }
    return file as any
  }

  /** Set the parent directory of the current directory. */
  protected setDirectory(directory: Directory<any, any>) {
    this.#directory = directory
  }

  /** Get the parent directory or a directory at the specified `path`. */
  async getDirectory(
    path?: string | string[]
  ): Promise<Directory<Types> | undefined> {
    if (path === undefined) {
      return this.#directory
    }

    const segments = Array.isArray(path) ? path.slice(0) : path.split('/')
    let currentDirectory: Directory<Types> = this as Directory<Types>

    while (segments.length > 0) {
      const currentSegment = segments.shift()
      const allEntries = await currentDirectory.getEntries()
      const entry = allEntries.find((entry) => {
        return (
          entry instanceof Directory && entry.getBaseName() === currentSegment
        )
      })

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
  ): Promise<Directory<Types>> {
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
  ): Promise<FileSystemEntry<any> | undefined> {
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
  ): Promise<FileSystemEntry<any>> {
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
    const directoryEntries = await fileSystem.readDirectory(this.#path, {
      recursive: options?.recursive,
    })
    const entriesMap = new Map<string, FileSystemEntry<any>>()

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
        const directory = new Directory<Types, FileSystemEntry<Types>>({
          fileSystem,
          path: entry.path,
          schema: this.#schema,
          getModule: this.#getModule,
        })

        if (this.#filterCallback) {
          directory.setFilterCallback(this.#filterCallback)
        }

        if (this.#sortCallback) {
          directory.setSortCallback(this.#sortCallback)
        }

        directory.setDirectory(this)

        if (this.#filterCallback && !(await this.#filterCallback(directory))) {
          continue
        }

        entriesMap.set(entry.path, directory)

        if (options?.recursive) {
          const nestedEntries = await directory.getEntries(options)
          for (const nestedEntry of nestedEntries) {
            entriesMap.set(nestedEntry.getRelativePath(), nestedEntry)
          }
        }
      } else if (entry.isFile) {
        const extension = extensionName(entry.name).slice(1)
        const file = isJavaScriptLikeExtension(extension)
          ? new JavaScriptFile({
              directory: this as Directory<Types>,
              path: entry.path,
              absolutePath: entry.absolutePath,
              schema: this.#schema,
              getModule: this.#getModule,
              isVirtualFileSystem: fileSystem instanceof VirtualFileSystem,
            })
          : new File({
              directory: this as Directory<Types>,
              path: entry.path,
              absolutePath: entry.absolutePath,
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

  /** Get all files within the directory. */
  async getFiles(options?: {
    recursive?: boolean
    includeIndexAndReadme?: boolean
  }): Promise<Extract<Entry, File<any>>[]> {
    const entries = await this.getEntries(options)

    return entries.filter((entry): entry is Extract<Entry, File<any>> =>
      isFile(entry)
    )
  }

  /** Get all directories within the directory. */
  async getDirectories(options?: { recursive?: boolean }) {
    const entries = await this.getEntries(options)
    return entries.filter(isDirectory) as Directory<Types>[]
  }

  /** Get the previous and next sibling entries (files or directories) of the parent directory. */
  async getSiblings(): Promise<
    [FileSystemEntry<Types> | undefined, FileSystemEntry<Types> | undefined]
  > {
    if (!this.#directory) {
      return [undefined, undefined]
    }

    const entries = await this.#directory.getEntries()
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
  getPath() {
    const fileSystem = this.getFileSystem()
    return fileSystem.getUrlPathRelativeTo(removeOrderPrefixes(this.#path))
  }

  /** Get the path segments of the directory. */
  getPathSegments() {
    const fileSystem = this.getFileSystem()
    const path = fileSystem.getUrlPathRelativeTo(this.#path, false)
    return path.split('/').filter(Boolean)
  }

  /** Get the relative path of the directory. */
  getRelativePath() {
    return this.#path
  }

  /** Get the directory path to the editor in local development and the configured git repository in production. */
  getEditPath() {
    return getEditPath(this.#path)
  }

  /** Get the absolute path of the directory. */
  getAbsolutePath() {
    return this.#path
  }

  async getCreatedAt() {
    const gitMetadata = await getGitMetadata(this.#path)
    return gitMetadata.createdAt ? new Date(gitMetadata.createdAt) : undefined
  }

  async getUpdatedAt() {
    const gitMetadata = await getGitMetadata(this.#path)
    return gitMetadata.updatedAt ? new Date(gitMetadata.updatedAt) : undefined
  }

  async getAuthors() {
    const gitMetadata = await getGitMetadata(this.#path)
    return gitMetadata.authors
  }
}

/** Determines if a `FileSystemEntry` is a `Directory`. */
export function isDirectory(entry: FileSystemEntry<any>): entry is Directory {
  return entry instanceof Directory
}

/** Determines if a `FileSystemEntry` is a `File`. */
export function isFile<Types extends ExtensionTypes>(
  entry: FileSystemEntry<Types>
): entry is File<Types> {
  return entry instanceof File
}

/** Determines if a `FileSystemEntry` is a `JavaScriptFile`. */
export function isJavaScriptFile<Exports extends ExtensionType>(
  entry: FileSystemEntry<any>
): entry is JavaScriptFile<Exports> {
  return entry instanceof JavaScriptFile
}

/** Determines the type of a `FileSystemEntry` based on its extension. */
export type FileWithExtension<
  Types extends ExtensionTypes,
  Extension extends keyof Types | (keyof Types)[],
> = Extension extends string
  ? IsJavaScriptLikeExtension<Extension> extends true
    ? JavaScriptFile<Types[Extension]>
    : File<Types>
  : Extension extends string[]
    ? HasJavaScriptLikeExtensions<Extension> extends true
      ? JavaScriptFile<
          Types[Extract<Extension[number], JavaScriptLikeExtensions>]
        >
      : File<Types>
    : File<Types>

/** Determines if a `FileSystemEntry` is a `File` with a specific extension. */
export function isFileWithExtension<
  Types extends ExtensionTypes,
  const Extension extends string | string[],
>(
  entry: FileSystemEntry<Types>,
  extension: Extension
): entry is FileWithExtension<Types, Extension> {
  if (isFile(entry)) {
    return entry.hasExtension(extension)
  }
  return false
}
