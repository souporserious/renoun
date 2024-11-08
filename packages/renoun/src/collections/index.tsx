import { getFileExports } from '../project/client.js'
import type { FileSystem } from './file-system/FileSystem.js'
import { VirtualFileSystem } from './file-system/VirtualFileSystem.js'
import {
  isJavaScriptLikeExtension,
  type JavaScriptLikeExtensions,
} from './is-javascript-like-extension.js'
import { basename, extname, join } from './path.js'

type IsJavaScriptLikeExtensions<FileExtensions extends string[]> =
  FileExtensions extends (infer FileExtension)[]
    ? FileExtension extends JavaScriptLikeExtensions
      ? true
      : false
    : false

type FileForExtension<
  FileExports extends ModuleExports = ModuleExports,
  FileExtensions extends Extract<keyof FileExports, string>[] = Extract<
    keyof FileExports,
    string
  >[],
> = FileExtensions extends JavaScriptLikeExtensions | JavaScriptLikeExtensions[]
  ? JavaScriptFile<FileExports>
  : File

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

/** A JavaScript file export with a strongly typed runtime value. */
export class JavaScriptFileExport<
  FileExports extends ModuleExports,
  ExportName extends keyof FileExports,
> {
  #name: ExportName
  #filePath: string
  #absoluteFilePath: string
  #runtimeModule: Promise<FileExports>

  constructor(
    name: ExportName,
    filePath: string,
    absoluteFilePath: string,
    runtimeModule: Promise<FileExports>
  ) {
    this.#name = name
    this.#filePath = filePath
    this.#absoluteFilePath = absoluteFilePath
    this.#runtimeModule = runtimeModule
  }

  getName() {
    return this.#name
  }

  getPath() {
    return this.#filePath
  }

  getAbsolutePath() {
    return this.#absoluteFilePath
  }

  async getRuntimeValue(): Promise<FileExports[ExportName]> {
    const fileExports = await this.#runtimeModule
    return fileExports[this.#name]
  }
}

interface JavaScriptFileOptions extends FileOptions {
  getJavaScriptModule?: (path: string) => Promise<any>
  tsConfigFilePath?: string
  isVirtual?: boolean
}

/** A JavaScript file in the file system. */
export class JavaScriptFile<FileExports extends ModuleExports> extends File {
  #getJavaScriptModule?: (path: string) => Promise<FileExports>
  #tsConfigFilePath?: string
  #isVirtual: boolean

  constructor({
    getJavaScriptModule,
    tsConfigFilePath,
    isVirtual = false,
    ...fileOptions
  }: JavaScriptFileOptions) {
    super(fileOptions)
    this.#getJavaScriptModule = getJavaScriptModule
    this.#tsConfigFilePath = tsConfigFilePath
    this.#isVirtual = isVirtual
  }

  async getExports(): Promise<FileExports> {
    return getFileExports(this.getAbsolutePath(), {
      tsConfigFilePath: this.#tsConfigFilePath,
      useInMemoryFileSystem: this.#isVirtual,
    })
  }

  async getExport<ExportName extends keyof FileExports>(
    name: ExportName
  ): Promise<JavaScriptFileExport<FileExports, ExportName>> {
    throw new Error('Not implemented')
  }
}

export type ModuleExports = { [name: string]: any }

export type DirectoryOptions<
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
} & (IsJavaScriptLikeExtensions<FileExtensions> extends true
  ? {
      tsConfigFilePath?: string
      getJavaScriptModule?: (path: string) => Promise<any>
    }
  : {})

/** A directory containing files and subdirectories in the file system. */
export class Directory<
  const FileExports extends ModuleExports = ModuleExports,
  const FileExtensions extends Extract<keyof FileExports, string>[] = Extract<
    keyof FileExports,
    string
  >[],
> {
  #fileSystem: FileSystem | undefined
  #fileExtensions: FileExtensions
  #path: string
  #rootPath: string
  #directory?: Directory
  #tsConfigFilePath?: string
  #getJavaScriptModule?: (path: string) => Promise<any>

  constructor(options: DirectoryOptions<FileExports, FileExtensions>) {
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

    if ('getJavaScriptModule' in options) {
      this.#getJavaScriptModule = options.getJavaScriptModule
    }
  }

  async #getFileSystem() {
    if (this.#fileSystem) {
      return this.#fileSystem
    }
    const { NodeFileSystem } = await import('./file-system/NodeFileSystem')
    this.#fileSystem = new NodeFileSystem(this.#tsConfigFilePath)
    return this.#fileSystem
  }

  async getFile(
    path: string | string[],
    extension?: FileExtensions[number] | FileExtensions[number][]
  ): Promise<FileForExtension<FileExports, FileExtensions> | undefined> {
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

      if (file) {
        if (isJavaScriptLikeExtension(extension)) {
          return file as JavaScriptFile<FileExports>
        }

        return file as FileForExtension<FileExports, FileExtensions>
      }
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
        entries.push(
          new Directory<FileExports, FileExtensions>({
            fileSystem,
            fileExtensions: this.#fileExtensions,
            path: entry.path,
            rootPath: this.#rootPath,
            directory: this,
            tsConfigFilePath: this.#tsConfigFilePath,
            getJavaScriptModule: this.#getJavaScriptModule,
          })
        )
      } else if (entry.isFile) {
        const extension = extname(entry.name).slice(1)

        if (
          !this.#fileExtensions ||
          this.#fileExtensions.includes(extension as any)
        ) {
          if (isJavaScriptLikeExtension(extension)) {
            entries.push(
              new JavaScriptFile({
                directory: this,
                path: entry.path,
                absolutePath: entry.absolutePath,
                getJavaScriptModule: this.#getJavaScriptModule,
                tsConfigFilePath: this.#tsConfigFilePath,
                isVirtual: fileSystem instanceof VirtualFileSystem,
              })
            )
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
    // TODO: add this.#fileSystem.getAbsolutePath(this.#path) method
    return this.#path
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
