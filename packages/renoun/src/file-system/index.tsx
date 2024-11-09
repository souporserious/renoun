import { getFileExports } from '../project/client.js'
import type { FileSystem } from './FileSystem.js'
import { VirtualFileSystem } from './VirtualFileSystem.js'
import {
  isJavaScriptLikeExtension,
  type HasJavaScriptLikeExtensions,
} from './is-javascript-like-extension.js'
import { basename, extname, join, relative } from './path.js'

export type FileSystemEntry<FileExports extends object> =
  | File
  | JavaScriptFile<FileExports>
  | Directory<FileExports>

interface FileOptions {
  directory: Directory
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

  getDirectory() {
    return this.#directory
  }

  getName() {
    return basename(this.#path, extname(this.#path))
  }

  getExtension() {
    return extname(this.#path).slice(1)
  }

  getPath() {
    return this.#path
  }

  getAbsolutePath() {
    return this.#absolutePath
  }

  async getSiblings(): Promise<
    [File | Directory | undefined, File | Directory | undefined]
  > {
    const entries = await this.#directory.getEntries()
    const index = entries.findIndex((file) => file.getPath() === this.getPath())
    const previousEntry = index > 0 ? entries[index - 1] : undefined
    const nextEntry =
      index < entries.length - 1 ? entries[index + 1] : undefined

    return [previousEntry, nextEntry]
  }
}

/** A JavaScript file export. */
export class JavaScriptFileExport<
  FileExports extends ModuleExports,
  ExportName extends keyof FileExports,
> {
  #name: ExportName
  #position: number
  #relativeFilePath: string
  #absoluteFilePath: string

  constructor(
    name: ExportName,
    position: number,
    relativeFilePath: string,
    absoluteFilePath: string
  ) {
    this.#name = name
    this.#position = position
    this.#relativeFilePath = relativeFilePath
    this.#absoluteFilePath = absoluteFilePath
  }

  getName() {
    return this.#name
  }

  getRelativePath() {
    return this.#relativeFilePath
  }

  getAbsolutePath() {
    return this.#absoluteFilePath
  }
}

interface JavaScriptFileOptions extends FileOptions {
  tsConfigFilePath?: string
  isVirtualFileSystem?: boolean
}

/** A JavaScript file in the file system. */
export class JavaScriptFile<FileExports extends ModuleExports> extends File {
  #tsConfigFilePath?: string
  #isVirtualFileSystem: boolean

  constructor({
    tsConfigFilePath,
    isVirtualFileSystem = false,
    ...fileOptions
  }: JavaScriptFileOptions) {
    super(fileOptions)
    this.#tsConfigFilePath = tsConfigFilePath
    this.#isVirtualFileSystem = isVirtualFileSystem
  }

  async getExports() {
    return getFileExports(this.getAbsolutePath(), {
      tsConfigFilePath: this.#tsConfigFilePath,
      useInMemoryFileSystem: this.#isVirtualFileSystem,
    })
  }

  async getExport<ExportName extends Extract<keyof FileExports, string>>(
    name: ExportName
  ): Promise<JavaScriptFileExport<FileExports, ExportName>> {
    const fileExports = await this.getExports()
    const fileExport = fileExports.find(
      (fileExport) => fileExport.name === name
    )

    if (!fileExport) {
      throw new Error(
        `[renoun] JavaScript file export "${name}" not found in ${this.getPath()}`
      )
    }

    const directory = this.getDirectory()
    const relativePath = relative(directory.getRootPath(), this.getPath())

    return new JavaScriptFileExport(
      fileExport.name as ExportName,
      fileExport.position,
      relativePath,
      this.getAbsolutePath()
    )
  }
}

/** A JavaScript file export with runtime value. */
export class JavaScriptFileExportWithRuntime<
  FileExports extends ModuleExports,
  ExportName extends keyof FileExports,
> extends JavaScriptFileExport<FileExports, ExportName> {
  protected getModule: (path: string) => Promise<FileExports>

  constructor(
    name: ExportName,
    position: number,
    relativeFilePath: string,
    absoluteFilePath: string,
    getModule: (path: string) => Promise<FileExports>
  ) {
    super(name, position, relativeFilePath, absoluteFilePath)
    this.getModule = getModule
  }

  async getRuntimeValue(): Promise<FileExports[ExportName]> {
    const fileModule = await this.getModule(this.getRelativePath())
    const fileModuleExport = fileModule[this.getName()]

    if (fileModuleExport === undefined) {
      throw new Error(
        `[renoun] JavaScript file export "${String(this.getName())}" not found in ${this.getAbsolutePath()}`
      )
    }

    return fileModuleExport
  }
}

interface JavaScriptFileWithRuntimeOptions extends JavaScriptFileOptions {
  getModule: (path: string) => Promise<any>
}

/** A JavaScript file with runtime value. */
export class JavaScriptFileWithRuntime<
  FileExports extends ModuleExports,
> extends JavaScriptFile<FileExports> {
  protected getModule: (path: string) => Promise<FileExports>

  constructor({ getModule, ...fileOptions }: JavaScriptFileWithRuntimeOptions) {
    super(fileOptions)
    this.getModule = getModule
  }

  async getExport<ExportName extends Extract<keyof FileExports, string>>(
    name: ExportName
  ): Promise<JavaScriptFileExportWithRuntime<FileExports, ExportName>> {
    const fileExports = await this.getExports()
    const fileExport = fileExports.find(
      (fileExport) => fileExport.name === name
    )

    if (!fileExport) {
      throw new Error(
        `[renoun] JavaScript file export "${name}" not found in ${this.getPath()}`
      )
    }

    const directory = this.getDirectory()
    const relativePath = relative(directory.getRootPath(), this.getPath())

    return new JavaScriptFileExportWithRuntime(
      fileExport.name as ExportName,
      fileExport.position,
      relativePath,
      this.getAbsolutePath(),
      this.getModule
    )
  }
}

export type ModuleExports = { [name: string]: any }

type BaseDirectoryOptions<
  FileExports extends ModuleExports = ModuleExports,
  FileExtensions extends Extract<keyof FileExports, string>[] = Extract<
    keyof FileExports,
    string
  >[],
> = {
  fileExtensions: FileExtensions
  fileSystem?: FileSystem
  directory?: Directory
  path?: string
  rootPath?: string
}

type DirectoryWithJavaScriptOptions<
  FileExports extends ModuleExports = ModuleExports,
  FileExtensions extends Extract<keyof FileExports, string>[] = Extract<
    keyof FileExports,
    string
  >[],
  RuntimeOptions extends {
    getModule?: (path: string) => Promise<any>
  } = {},
> = BaseDirectoryOptions<FileExports, FileExtensions> & {
  tsConfigFilePath?: string
} & RuntimeOptions

export type DirectoryOptions<
  FileExports extends ModuleExports = ModuleExports,
  FileExtensions extends Extract<keyof FileExports, string>[] = Extract<
    keyof FileExports,
    string
  >[],
  RuntimeOptions extends {
    getModule?: (path: string) => Promise<any>
  } = {},
> =
  HasJavaScriptLikeExtensions<FileExtensions> extends true
    ? DirectoryWithJavaScriptOptions<
        FileExports,
        FileExtensions,
        RuntimeOptions
      >
    : BaseDirectoryOptions<FileExports, FileExtensions>

/** A directory containing files and subdirectories in the file system. */
export class Directory<
  const FileExports extends ModuleExports = ModuleExports,
  const FileExtensions extends Extract<keyof FileExports, string>[] = Extract<
    keyof FileExports,
    string
  >[],
  RuntimeOptions extends {
    getModule?: (path: string) => Promise<any>
  } = {},
> {
  #fileSystem: FileSystem | undefined
  #fileExtensions: FileExtensions
  #path: string
  #rootPath: string
  #directory?: Directory
  #tsConfigFilePath?: string
  protected getModule?: (path: string) => Promise<any>

  constructor(
    options: DirectoryOptions<FileExports, FileExtensions, RuntimeOptions>
  ) {
    this.#fileSystem = options.fileSystem
    this.#fileExtensions = options.fileExtensions
    this.#path = options.path
      ? options.path.startsWith('.')
        ? options.path
        : join('.', options.path)
      : '.'
    this.#rootPath = options.rootPath ?? this.#path
    this.#directory = options.directory

    if ('tsConfigFilePath' in options) {
      this.#tsConfigFilePath = options.tsConfigFilePath
    }

    if ('getModule' in options) {
      this.getModule = options.getModule
    }
  }

  async #getFileSystem() {
    if (this.#fileSystem) {
      return this.#fileSystem
    }
    const { NodeFileSystem } = await import('./NodeFileSystem.js')
    this.#fileSystem = new NodeFileSystem(this.#tsConfigFilePath)
    return this.#fileSystem
  }

  #hasJavaScriptModule(): this is {
    getModule: (path: string) => Promise<any>
  } {
    return typeof this.getModule === 'function'
  }

  async getFile<
    Extension extends FileExtensions[number] | undefined = undefined,
  >(
    path: string | string[],
    extension?: Extension | Extension[]
  ): Promise<
    | (HasJavaScriptLikeExtensions<FileExtensions> extends true
        ? RuntimeOptions extends {
            getModule: (path: string) => Promise<any>
          }
          ? JavaScriptFileWithRuntime<FileExports>
          : JavaScriptFile<FileExports>
        : File)
    | undefined
  > {
    const normalizedPath = Array.isArray(path) ? join(...path) : path
    const filePath = join(this.#rootPath, normalizedPath)
    const fileExtensions = extension
      ? Array.isArray(extension)
        ? extension
        : [extension]
      : this.#fileExtensions
    const allFiles = await this.getEntries()

    for (const extension of fileExtensions) {
      const filePathWithExtension = `${filePath}.${extension}`
      const file = allFiles.find(
        (file) => file.getPath() === filePathWithExtension
      )

      return file as HasJavaScriptLikeExtensions<FileExtensions> extends true
        ? RuntimeOptions extends {
            getModule: (path: string) => Promise<any>
          }
          ? JavaScriptFileWithRuntime<FileExports>
          : JavaScriptFile<FileExports>
        : File
    }

    return undefined
  }

  async getDirectory(
    path: string | string[]
  ): Promise<Directory<FileExports, FileExtensions> | undefined> {
    const normalizedPath = Array.isArray(path) ? path : [path]
    const directoryPath = this.#path
      ? join(this.#path, ...normalizedPath)
      : join(...normalizedPath)
    const allEntries = await this.getEntries()
    const directory = allEntries.find(
      (entry) => isDirectory(entry) && entry.getPath() === directoryPath
    )

    return directory as Directory<FileExports, FileExtensions> | undefined
  }

  async getEntries(): Promise<FileSystemEntry<FileExports>[]> {
    const fileSystem = await this.#getFileSystem()
    const directoryEntries = await fileSystem.readDirectory(this.#path)
    const entries: FileSystemEntry<FileExports>[] = []

    for (const entry of directoryEntries) {
      if (fileSystem.isFilePathExcludedFromTsConfig(entry.path)) {
        continue
      }

      if (entry.isDirectory) {
        const directoryOptions = {
          fileSystem,
          fileExtensions: this.#fileExtensions,
          path: entry.path,
          rootPath: this.#rootPath,
          directory: this,
          tsConfigFilePath: this.#tsConfigFilePath,
          getModule: this.getModule,
        } satisfies DirectoryWithJavaScriptOptions<
          FileExports,
          FileExtensions,
          { getModule?: (path: string) => Promise<any> }
        >

        entries.push(
          new Directory<FileExports, FileExtensions>(directoryOptions)
        )
      } else if (entry.isFile) {
        const extension = extname(entry.name).slice(1)

        if (
          !this.#fileExtensions ||
          this.#fileExtensions.includes(extension as FileExtensions[number])
        ) {
          if (isJavaScriptLikeExtension(extension)) {
            if (this.#hasJavaScriptModule()) {
              entries.push(
                new JavaScriptFileWithRuntime({
                  directory: this,
                  path: entry.path,
                  absolutePath: entry.absolutePath,
                  getModule: this.getModule!,
                  tsConfigFilePath: this.#tsConfigFilePath,
                  isVirtualFileSystem: fileSystem instanceof VirtualFileSystem,
                })
              )
            } else {
              entries.push(
                new JavaScriptFile({
                  directory: this,
                  path: entry.path,
                  absolutePath: entry.absolutePath,
                  tsConfigFilePath: this.#tsConfigFilePath,
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
    }

    return entries
  }

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

  getName() {
    return basename(this.#path)
  }

  getPath() {
    return this.#path
  }

  getAbsolutePath() {
    return this.#path
  }

  getRootPath() {
    return this.#rootPath
  }
}

/** Determines if a `FileSystemEntry` is a `File`. */
export function isFile<FileExports extends object>(
  entry: FileSystemEntry<FileExports>
): entry is File {
  return entry instanceof File
}

/** Determines if a `FileSystemEntry` is a `JavaScriptFile`. */
export function isJavaScriptFile<FileExports extends object>(
  entry: FileSystemEntry<FileExports>
): entry is JavaScriptFile<FileExports> {
  return entry instanceof JavaScriptFile
}

/** Determines if a `FileSystemEntry` is a `Directory`. */
export function isDirectory<
  const FileExports extends ModuleExports = ModuleExports,
  const FileExtensions extends Extract<keyof FileExports, string>[] = Extract<
    keyof FileExports,
    string
  >[],
>(
  entry: FileSystemEntry<FileExports>
): entry is Directory<FileExports, FileExtensions> {
  return entry instanceof Directory
}
