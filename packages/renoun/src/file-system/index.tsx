import { getFileExports } from '../project/client.js'
import type { FileSystem } from './FileSystem.js'
import { VirtualFileSystem } from './VirtualFileSystem.js'
import {
  isJavaScriptLikeExtension,
  type IsJavaScriptLikeExtension,
} from './is-javascript-like-extension.js'
import { basename, extname, join, relative, removeExtension } from './path.js'

export type FileSystemEntry<FileExports extends object> =
  | File
  | JavaScriptFile<FileExports>
  | Directory

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
export class JavaScriptFile<
  FileExports extends ModuleExports = ModuleExports,
> extends File {
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
  FileExports extends ModuleExports = ModuleExports,
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

interface DirectoryOptions {
  path?: string
  rootPath?: string
  tsConfigPath?: string
  fileSystem?: FileSystem
  directory?: Directory
  getModule?: (path: string) => Promise<any>
}

/** A directory containing files and subdirectories in the file system. */
export class Directory<
  Exports extends ModuleExports = ModuleExports,
  const Options extends DirectoryOptions = DirectoryOptions,
> {
  #fileSystem: FileSystem | undefined
  #directory?: Directory
  #path: string
  #rootPath: string
  #tsConfigPath?: string
  protected getModule?: (path: string) => Promise<any>

  constructor(options: Options = {} as Options) {
    this.#path = options.path
      ? options.path.startsWith('.')
        ? options.path
        : join('.', options.path)
      : '.'
    this.#rootPath = options.rootPath ?? this.#path
    this.#tsConfigPath = options.tsConfigPath
    this.#fileSystem = options.fileSystem
    this.#directory = options.directory
    this.getModule = options.getModule
  }

  async #getFileSystem() {
    if (this.#fileSystem) {
      return this.#fileSystem
    }
    const { NodeFileSystem } = await import('./NodeFileSystem.js')
    this.#fileSystem = new NodeFileSystem(this.#tsConfigPath)
    return this.#fileSystem
  }

  async getFile<Extension extends string | undefined = undefined>(
    path: string | string[],
    extension?: Extension | Extension[]
  ): Promise<
    | (Extension extends string
        ? IsJavaScriptLikeExtension<Extension> extends true
          ? 'getModule' extends keyof Options
            ? JavaScriptFileWithRuntime<Exports[Extension]>
            : JavaScriptFile<Exports[Extension]>
          : File
        : File)
    | undefined
  > {
    const normalizedPath = Array.isArray(path) ? join(...path) : path
    const filePath = join(this.#rootPath, normalizedPath)
    const allFiles = await this.getEntries()
    const fileExtensions = Array.isArray(extension) ? extension : [extension]

    if (extension) {
      for (const extension of fileExtensions) {
        const filePathWithExtension = `${filePath}.${extension}`
        const file = allFiles.find(
          (file) => file.getPath() === filePathWithExtension
        )

        if (file) {
          return file as any
        }
      }
    } else {
      const file = allFiles.find(
        (file) => removeExtension(file.getPath()) === filePath
      )

      if (file) {
        return file as any
      }
    }

    return undefined
  }

  async getDirectory(path: string | string[]): Promise<Directory | undefined> {
    const normalizedPath = Array.isArray(path) ? path : [path]
    const directoryPath = this.#path
      ? join(this.#path, ...normalizedPath)
      : join(...normalizedPath)
    const allEntries = await this.getEntries()
    const directory = allEntries.find(
      (entry) => isDirectory(entry) && entry.getPath() === directoryPath
    )

    return directory as Directory | undefined
  }

  async getEntries(): Promise<FileSystemEntry<any>[]> {
    const fileSystem = await this.#getFileSystem()
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
        const directoryOptions = {
          fileSystem,
          directory: this,
          path: entry.path,
          rootPath: this.#rootPath,
          tsConfigPath: this.#tsConfigPath,
          getModule: this.getModule,
        } satisfies DirectoryOptions

        entries.push(new Directory(directoryOptions))
      } else if (entry.isFile) {
        const extension = extname(entry.name).slice(1)

        if (isJavaScriptLikeExtension(extension)) {
          if (typeof this.getModule === 'function') {
            entries.push(
              new JavaScriptFileWithRuntime({
                directory: this,
                path: entry.path,
                absolutePath: entry.absolutePath,
                getModule: this.getModule,
                tsConfigFilePath: this.#tsConfigPath,
                isVirtualFileSystem: fileSystem instanceof VirtualFileSystem,
              })
            )
          } else {
            entries.push(
              new JavaScriptFile({
                directory: this,
                path: entry.path,
                absolutePath: entry.absolutePath,
                tsConfigFilePath: this.#tsConfigPath,
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
export function isFile(entry: FileSystemEntry<any>): entry is File {
  return entry instanceof File
}

/** Determines if a `FileSystemEntry` is a `JavaScriptFile`. */
export function isJavaScriptFile<JavaScriptExports extends object>(
  entry: FileSystemEntry<any>
): entry is JavaScriptFile<JavaScriptExports> {
  return entry instanceof JavaScriptFile
}

/** Determines if a `FileSystemEntry` is a `Directory`. */
export function isDirectory(entry: FileSystemEntry<any>): entry is Directory {
  return entry instanceof Directory
}
