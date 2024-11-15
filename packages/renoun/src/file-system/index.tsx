import { getFileExports } from '../project/client.js'
import { getEditPath } from '../utils/get-edit-path.js'
import { getGitMetadata } from '../utils/get-git-metadata.js'
import type { FileSystem } from './FileSystem.js'
import { NodeFileSystem } from './NodeFileSystem.js'
import { VirtualFileSystem } from './VirtualFileSystem.js'
import {
  isJavaScriptLikeExtension,
  type IsJavaScriptLikeExtension,
} from './is-javascript-like-extension.js'
import { basename, extname, join, relative, removeExtension } from './path.js'

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

  /**
   * Get the base name of the file excluding the extension. The directory name
   * will be used if the file is an index or readme file.
   */
  getName() {
    let name = this.getBaseName()

    // Use the directory name if the file is an index or readme file
    if (['index', 'readme'].includes(name.toLowerCase())) {
      name = this.#directory.getName()
    }

    return name.split('.').at(0)!
  }

  /** Get the base name of the file excluding the extension. */
  getBaseName() {
    return (
      basename(this.#path, extname(this.#path))
        // remove leading numbers e.g. 01.intro -> intro
        .replace(/^\d+\./, '')
    )
  }

  /** Get the extension of the file. */
  getExtension() {
    return extname(this.#path).slice(1)
  }

  /** Get a URL-friendly path to the file. */
  getPath() {
    const fileSystem = this.#directory.getFileSystem()
    return fileSystem.getUrlPathRelativeTo(removeExtension(this.#path))
  }

  /** Get the relative path to the file. */
  getRelativePath() {
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

  /**
   * Get the previous and next sibling entries (files or directories) of the parent directory.
   * If the file is an index or readme file, the siblings will be retrieved from the parent directory.
   */
  async getSiblings(): Promise<
    [File | Directory | undefined, File | Directory | undefined]
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
export class JavaScriptFileExport<Exports extends ExtensionType> {
  #name: string
  #file: JavaScriptFile<Exports>

  constructor(name: string, file: JavaScriptFile<Exports>) {
    this.#name = name
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
              `[renoun] Schema validation failed to parse export "${name}" at file path "${this.getRelativePath()}"`,
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
  ): Promise<JavaScriptFileExport<Exports>> {
    return new JavaScriptFileExport(name, this)
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
    file: JavaScriptFile<Exports>,
    getModule: (path: string) => Promise<any>
  ) {
    super(name, file)
    this.#file = file
    this.#getModule = getModule
  }

  /**
   * Get the runtime value of the export. An error will be thrown if the export
   * is not found or the configured schema validation for this file extension fails.
   */
  async getRuntimeValue(): Promise<Value> {
    const exportName = this.getName()
    const fileSystem = this.#file.getDirectory().getFileSystem()
    const fileModule = await this.#getModule(
      this.#file.getPathRelativeTo(fileSystem.getRootPath())
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
    JavaScriptFileExportWithRuntime<Exports[ExportName], Exports, ExportName>
  > {
    return new JavaScriptFileExportWithRuntime(name, this, this.getModule)
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
  #basePath?: string
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
    this.#basePath = options.basePath
    this.#fileSystem = options.fileSystem
    this.#directory = options.directory
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
    const segments = Array.isArray(path) ? path.slice(0) : path.split('/')
    let currentDirectory: Directory<Types> = this
    let entry: FileSystemEntry<any> | undefined

    while (segments.length > 0) {
      const currentSegment = segments.shift()
      const allEntries = await currentDirectory.getEntries(
        // @ts-expect-error - private argument to enable adding `index` and `readme` files
        true
      )

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
          const entries = await entry.getEntries(
            // @ts-expect-error - private argument to enable adding `index` and `readme` files
            true
          )
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

  /** Get the parent directory or a directory at the specified `path`. */
  async getDirectory(
    path?: string | string[]
  ): Promise<Directory<Types> | undefined> {
    if (path === undefined) {
      return this.#directory
    }

    const segments = Array.isArray(path) ? path.slice(0) : path.split('/')
    let currentDirectory: Directory<Types> = this

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
   * Additionally, `index` and `readme` files are excluded as they represent the directory.
   */
  async getEntries(): Promise<FileSystemEntry<any>[]> {
    const includeIndexAndReadme = arguments[0]
    const fileSystem = this.getFileSystem()
    const directoryEntries = await fileSystem.readDirectory(this.#path)
    const entries: FileSystemEntry<any>[] = []

    for (const entry of directoryEntries) {
      if (
        fileSystem.isFilePathGitIgnored(entry.path) ||
        fileSystem.isFilePathExcludedFromTsConfig(entry.path)
      ) {
        continue
      }

      let fileSystemEntry: FileSystemEntry<any> | undefined

      if (entry.isDirectory) {
        fileSystemEntry = new Directory<Types>({
          fileSystem,
          directory: this,
          path: entry.path,
          schema: this.#schema,
          getModule: this.#getModule,
        })
      } else if (entry.isFile) {
        const extension = extname(entry.name).slice(1)

        if (isJavaScriptLikeExtension(extension)) {
          if (typeof this.#getModule === 'function') {
            fileSystemEntry = new JavaScriptFileWithRuntime({
              directory: this,
              path: entry.path,
              absolutePath: entry.absolutePath,
              getModule: this.#getModule,
              schema: this.#schema,
              isVirtualFileSystem: fileSystem instanceof VirtualFileSystem,
            })
          } else {
            fileSystemEntry = new JavaScriptFile({
              directory: this,
              path: entry.path,
              absolutePath: entry.absolutePath,
              schema: this.#schema,
              isVirtualFileSystem: fileSystem instanceof VirtualFileSystem,
            })
          }
        } else {
          fileSystemEntry = new File({
            directory: this,
            path: entry.path,
            absolutePath: entry.absolutePath,
          })
        }

        // Skip `index` and `readme` files if not explicitly included since they represent the directory
        if (
          !includeIndexAndReadme &&
          ['index', 'readme'].includes(
            fileSystemEntry.getBaseName().toLowerCase()
          )
        ) {
          continue
        }
      }

      if (fileSystemEntry) {
        entries.push(fileSystemEntry)
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
    return (
      basename(this.#path)
        // remove leading numbers e.g. 01.intro -> intro
        .replace(/^\d+\./, '')
    )
  }

  /** Get a URL-friendly path of the directory. */
  getPath() {
    const fileSystem = this.getFileSystem()
    return fileSystem.getUrlPathRelativeTo(this.#path)
  }

  /** Get the relative path of the directory. */
  getRelativePath() {
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
