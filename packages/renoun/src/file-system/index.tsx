import { getFileExports } from '../project/client.js'
import { getEditPath } from '../utils/get-edit-path.js'
import { getGitMetadata } from '../utils/get-git-metadata.js'
import type { FileSystem } from './FileSystem.js'
import { VirtualFileSystem } from './VirtualFileSystem.js'
import {
  isJavaScriptLikeExtension,
  type IsJavaScriptLikeExtension,
} from './is-javascript-like-extension.js'
import { basename, extname, join, relative } from './path.js'

export type FileSystemEntry<Types extends ExtensionTypes> =
  | File
  | JavaScriptFile<any>
  | Directory<Types>

interface FileOptions {
  directory: Directory<any, any>
  path: string
  absolutePath: string
}

/** A file in the file system. */
export class File {
  #directory: Directory
  #path: string
  #absolutePath: string

  constructor(options: FileOptions) {
    this.#directory = options.directory
    this.#path = options.path
    this.#absolutePath = options.absolutePath
  }

  /** Get the directory containing this file. */
  getDirectory() {
    return this.#directory
  }

  /** Get the base name of the file excluding the extension. */
  getName() {
    return basename(this.#path, extname(this.#path))
  }

  /** Get the extension of the file. */
  getExtension() {
    return extname(this.#path).slice(1)
  }

  /** Get the relative path of the file. */
  getPath() {
    return this.#path
  }

  /** Get the file path to the editor in local development and the configured git repository in production. */
  getEditPath() {
    return getEditPath(this.#path)
  }

  /** Get the path segments of the file. */
  getPathSegments() {
    return this.#path.split('/').filter(Boolean)
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

  /** Get the previous and next sibling entries (files or directories) of the parent directory. */
  async getSiblings(): Promise<
    [File | Directory | undefined, File | Directory | undefined]
  > {
    const entries = await this.#directory.getEntries()
    const index = entries.findIndex((file) => file.getPath() === this.getPath())
    const previous = index > 0 ? entries[index - 1] : undefined
    const next = index < entries.length - 1 ? entries[index + 1] : undefined

    return [previous, next]
  }
}

/** A JavaScript file export. */
export class JavaScriptFileExport<Exports extends ExtensionType> {
  #name: string
  #position: number
  #file: JavaScriptFile<Exports>

  constructor(name: string, position: number, file: JavaScriptFile<Exports>) {
    this.#name = name
    this.#position = position
    this.#file = file
  }

  /** Get the name of the export. */
  getName() {
    return this.#name
  }
}

interface JavaScriptFileOptions extends FileOptions {
  schema?: DirectoryOptions<any>['schema']
  tsConfigFilePath?: string
  isVirtualFileSystem?: boolean
}

/** A JavaScript file in the file system. */
export class JavaScriptFile<Exports extends ExtensionType> extends File {
  #schema?: DirectoryOptions<any>['schema']
  #tsConfigFilePath?: string
  #isVirtualFileSystem: boolean

  constructor({
    schema,
    tsConfigFilePath,
    isVirtualFileSystem = false,
    ...fileOptions
  }: JavaScriptFileOptions) {
    super(fileOptions)
    this.#schema = schema
    this.#tsConfigFilePath = tsConfigFilePath
    this.#isVirtualFileSystem = isVirtualFileSystem
  }

  /** Parse and validate an export value using the configured schema. */
  parseSchemaExportValue(name: string, value: any): any {
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
              `[renoun] Schema validation failed to parse export "${name}" at file path "${this.getPath()}"`,
              { cause: error }
            )
          }
        }
      }
    }

    return value
  }

  /** Get all exports from the JavaScript file. */
  async getExports() {
    return getFileExports(this.getAbsolutePath(), {
      tsConfigFilePath: this.#tsConfigFilePath,
      useInMemoryFileSystem: this.#isVirtualFileSystem,
    })
  }

  /** Get a JavaScript file export by name. */
  async getExport<ExportName extends Extract<keyof Exports, string>>(
    name: ExportName
  ): Promise<JavaScriptFileExport<Exports> | undefined> {
    const fileExports = await this.getExports()
    const fileExport = fileExports.find(
      (fileExport) => fileExport.name === name
    )

    if (!fileExport) {
      return undefined
    }

    return new JavaScriptFileExport(
      fileExport.name as ExportName,
      fileExport.position,
      this
    )
  }

  /** Get a JavaScript file export by name. An error will be thrown if the export is not found. */
  async getExportOrThrow<ExportName extends Extract<keyof Exports, string>>(
    name: ExportName
  ): Promise<JavaScriptFileExport<Exports>> {
    const fileExport = await this.getExport(name)

    if (!fileExport) {
      throw new Error(
        `[renoun] JavaScript file export "${name}" not found in ${this.getAbsolutePath()}`
      )
    }

    return fileExport
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
  #file: JavaScriptFile<Exports>
  #getModule: (path: string) => Promise<any>

  constructor(
    name: ExportName,
    position: number,
    file: JavaScriptFile<Exports>,
    getModule: (path: string) => Promise<any>
  ) {
    super(name, position, file)
    this.#file = file
    this.#getModule = getModule
  }

  /**
   * Get the runtime value of the export. An error will be thrown if the export
   * is not found or the configured schema validation for this file extension fails.
   */
  async getRuntimeValue(): Promise<Value> {
    const exportName = this.getName()
    const fileSystem = await this.#file.getDirectory().getFileSystem()
    const fileModule = await this.#getModule(
      this.#file.getPathRelativeTo(fileSystem.getPath())
    )
    const fileModuleExport = fileModule[this.getName()]

    if (fileModuleExport === undefined) {
      throw new Error(
        `[renoun] JavaScript file export "${String(this.getName())}" not found in ${this.#file.getAbsolutePath()}`
      )
    }

    return this.#file.parseSchemaExportValue(exportName, fileModuleExport)
  }
}

interface JavaScriptFileWithRuntimeOptions extends JavaScriptFileOptions {
  getModule: (path: string) => Promise<any>
}

/** A JavaScript file with runtime value. */
export class JavaScriptFileWithRuntime<
  Exports extends ExtensionType,
> extends JavaScriptFile<Exports> {
  protected getModule: (path: string) => Promise<any>

  constructor({ getModule, ...fileOptions }: JavaScriptFileWithRuntimeOptions) {
    super(fileOptions)
    this.getModule = getModule
  }

  /** Get a JavaScript file export by name. */
  async getExport<ExportName extends Extract<keyof Exports, string>>(
    name: ExportName
  ): Promise<
    | JavaScriptFileExportWithRuntime<Exports[ExportName], Exports, ExportName>
    | undefined
  > {
    const fileExports = await this.getExports()
    const fileExport = fileExports.find(
      (fileExport) => fileExport.name === name
    )

    if (!fileExport) {
      return undefined
    }

    return new JavaScriptFileExportWithRuntime(
      fileExport.name as ExportName,
      fileExport.position,
      this,
      this.getModule
    )
  }

  /** Get a JavaScript file export by name. An error will be thrown if the export is not found. */
  async getExportOrThrow<ExportName extends Extract<keyof Exports, string>>(
    name: ExportName
  ): Promise<
    JavaScriptFileExportWithRuntime<Exports[ExportName], Exports, ExportName>
  > {
    const fileExport = await this.getExport(name)

    if (!fileExport) {
      throw new Error(
        `[renoun] JavaScript file export "${name}" not found in ${this.getAbsolutePath()}`
      )
    }

    return fileExport
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
  fileSystem?: FileSystem
  directory?: Directory<any, any>
  schema?: ExtensionSchemas<Types>
  getModule?: (path: string) => Promise<any>
}

/** A directory containing files and subdirectories in the file system. */
export class Directory<
  Types extends ExtensionTypes = ExtensionTypes,
  const Options extends DirectoryOptions<Types> = DirectoryOptions<Types>,
> {
  #path: string
  #fileSystem: FileSystem | undefined
  #directory?: Directory<any, any>
  #schema?: ExtensionSchemas<Types>
  #getModule?: (path: string) => Promise<any>

  constructor(options: Options = {} as Options) {
    this.#path = options.path
      ? options.path.startsWith('.')
        ? options.path
        : join('.', options.path)
      : '.'
    this.#fileSystem = options.fileSystem
    this.#directory = options.directory
    this.#schema = options.schema
    this.#getModule = options.getModule
  }

  async getFileSystem() {
    if (this.#fileSystem) {
      return this.#fileSystem
    }
    const { NodeFileSystem } = await import('./NodeFileSystem.js')
    this.#fileSystem = new NodeFileSystem({ basePath: this.#path })
    return this.#fileSystem
  }

  /** Get a file at the specified `path` and optional extensions. */
  async getFile<Extension extends string | undefined = undefined>(
    path: string | string[],
    extension?: Extension | Extension[]
  ): Promise<
    | (Extension extends string
        ? IsJavaScriptLikeExtension<Extension> extends true
          ? 'getModule' extends keyof Options
            ? JavaScriptFileWithRuntime<Types[Extension]>
            : JavaScriptFile<Types[Extension]>
          : File
        : File)
    | undefined
  > {
    const segments = Array.isArray(path) ? path : path.split('/')
    let currentDirectory: Directory<Types> = this
    let entry: FileSystemEntry<any> | undefined

    while (segments.length > 0) {
      const currentSegment = segments.shift()
      const allEntries = await currentDirectory.getEntries()

      // Find the entry matching the current segment
      entry = allEntries.find((entry) => entry.getName() === currentSegment)

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
          const entries = await entry.getEntries()
          const targetFiles = ['index', 'readme']

          for (const subEntry of entries) {
            const name = subEntry.getName().toLowerCase()
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
        ? 'getModule' extends keyof Options
          ? JavaScriptFileWithRuntime<Types[Extension]>
          : JavaScriptFile<Types[Extension]>
        : File
      : File
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

  /** Get a directory at the specified `path`. */
  async getDirectory(path: string | string[]): Promise<Directory | undefined> {
    const segments = Array.isArray(path) ? path : path.split('/')
    let currentDirectory: Directory<Types> = this

    while (segments.length > 0) {
      const currentSegment = segments.shift()
      const allEntries = await currentDirectory.getEntries()
      const entry = allEntries.find((entry) => {
        return entry instanceof Directory && entry.getName() === currentSegment
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
  async getDirectoryOrThrow(path: string | string[]): Promise<Directory> {
    const directory = await this.getDirectory(path)
    if (!directory) {
      throw new Error(`[renoun] Directory not found at path "${join(...path)}"`)
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
   * Get all entries within the directory that are not git ignored or excluded
   * from the tsconfig file if configured.
   */
  async getEntries(): Promise<FileSystemEntry<any>[]> {
    const fileSystem = await this.getFileSystem()
    const directoryEntries = await fileSystem.readDirectory(this.#path)
    const entries: FileSystemEntry<any>[] = []

    for (const entry of directoryEntries) {
      if (
        fileSystem.isFilePathGitIgnored(entry.path) ||
        fileSystem.isFilePathExcludedFromTsConfig(entry.path)
      ) {
        continue
      }

      if (entry.isDirectory) {
        entries.push(
          new Directory<Types>({
            fileSystem,
            directory: this,
            path: entry.path,
            schema: this.#schema,
            getModule: this.#getModule,
          })
        )
      } else if (entry.isFile) {
        const extension = extname(entry.name).slice(1)

        if (isJavaScriptLikeExtension(extension)) {
          if (typeof this.#getModule === 'function') {
            entries.push(
              new JavaScriptFileWithRuntime({
                directory: this,
                path: entry.path,
                absolutePath: entry.absolutePath,
                getModule: this.#getModule,
                schema: this.#schema,
                isVirtualFileSystem: fileSystem instanceof VirtualFileSystem,
              })
            )
          } else {
            entries.push(
              new JavaScriptFile({
                directory: this,
                path: entry.path,
                absolutePath: entry.absolutePath,
                schema: this.#schema,
                isVirtualFileSystem: fileSystem instanceof VirtualFileSystem,
              })
            )
          }
        } else {
          entries.push(
            new File({
              directory: this,
              path: entry.path,
              absolutePath: entry.absolutePath,
            })
          )
        }
      }
    }

    return entries
  }

  /** Get the previous and next sibling entries (files or directories) of the parent directory. */
  async getSiblings(): Promise<
    [File | Directory | undefined, File | Directory | undefined]
  > {
    if (!this.#directory) {
      return [undefined, undefined]
    }

    const entries = await this.#directory.getEntries()
    const index = entries.findIndex(
      (entryToCompare) => entryToCompare.getPath() === this.getPath()
    )
    const previous = index > 0 ? entries[index - 1] : undefined
    const next = index < entries.length - 1 ? entries[index + 1] : undefined

    return [previous, next]
  }

  /** Get the base name of the directory. */
  getName() {
    return basename(this.#path)
  }

  /** Get the relative path of the directory. */
  getPath() {
    return this.#path
  }

  /** Get the directory path to the editor in local development and the configured git repository in production. */
  getEditPath() {
    return getEditPath(this.#path)
  }

  /** Get the path segments of the directory. */
  getPathSegments() {
    return this.#path.split('/').filter(Boolean)
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

/** Determines if a `FileSystemEntry` is a `File`. */
export function isFile(entry: FileSystemEntry<any>): entry is File {
  return entry instanceof File
}

/** Determines if a `FileSystemEntry` is a `JavaScriptFile`. */
export function isJavaScriptFile<Schema extends ExtensionSchema>(
  entry: FileSystemEntry<any>
): entry is JavaScriptFile<Schema> {
  return entry instanceof JavaScriptFile
}

/** Determines if a `FileSystemEntry` is a `Directory`. */
export function isDirectory(entry: FileSystemEntry<any>): entry is Directory {
  return entry instanceof Directory
}
