import { readdir } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { basename, extname, join, relative } from 'node:path'
import { minimatch } from 'minimatch'

const javascriptLikeExtensions = [
  'js',
  'jsx',
  'ts',
  'tsx',
  'mjs',
  'mjsx',
  'cjs',
  'cjsx',
  'mts',
  'mtsx',
  'cts',
  'ctsx',
  'md',
  'mdx',
] as const

type JavaScriptLikeExtensions = (typeof javascriptLikeExtensions)[number]

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

/** A file in the file system. */
export class File {
  #directory: Directory
  #filePath: string
  #baseDirectory?: string

  constructor(directory: Directory, filePath: string, baseDirectory?: string) {
    this.#directory = directory
    this.#filePath = filePath
    this.#baseDirectory = baseDirectory
  }

  getName() {
    return basename(this.#filePath, extname(this.#filePath))
  }

  getExtension() {
    return extname(this.#filePath).slice(1)
  }

  getPath() {
    return this.#baseDirectory
      ? relative(this.#baseDirectory, this.#filePath)
      : this.#filePath
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
  #runtimeModule: Promise<FileExports>

  constructor(
    name: ExportName,
    filePath: string,
    runtimeModule: Promise<FileExports>
  ) {
    this.#name = name
    this.#filePath = filePath
    this.#runtimeModule = runtimeModule
  }

  getName() {
    return this.#name
  }

  getPath() {
    return this.#filePath
  }

  async getRuntimeValue(): Promise<FileExports[ExportName]> {
    const fileExports = await this.#runtimeModule
    return fileExports[this.#name]
  }
}

/** A JavaScript file in the file system. */
export class JavaScriptFile<FileExports extends ModuleExports> extends File {
  #getModule?: (path: string) => Promise<FileExports>

  constructor(
    directory: Directory,
    basePath: string,
    baseDirectory?: string,
    getModule?: (path: string) => Promise<FileExports>
  ) {
    super(directory, basePath, baseDirectory)
    this.#getModule = getModule
  }

  async getExports(): Promise<FileExports> {
    if (!this.#getModule) throw new Error('Module loader not provided')
    return await this.#getModule(this.getPath())
  }

  async getExport<ExportName extends keyof FileExports>(
    name: ExportName
  ): Promise<JavaScriptFileExport<FileExports, ExportName>> {
    const moduleExports = await this.getExports()
    return new JavaScriptFileExport(
      name,
      this.getPath(),
      Promise.resolve(moduleExports)
    )
  }
}

export type ModuleExports = { [name: string]: any }

/** A directory containing files and subdirectories in the file system. */
export class Directory<
  const FileExports extends ModuleExports = ModuleExports,
  const FileExtensions extends Extract<keyof FileExports, string>[] = Extract<
    keyof FileExports,
    string
  >[],
> {
  #basePath?: string
  #baseDirectory?: string
  #fileExtensions: FileExtensions[]
  #tsConfigFilePath?: string
  #getModule?: (path: string) => Promise<any>

  constructor(
    fileExtensions: FileExtensions[],
    basePath?: string,
    baseDirectory?: string,
    tsConfigFilePath?: string,
    getModule?: (path: string) => Promise<FileExports>
  ) {
    this.#basePath = basePath
    this.#baseDirectory = baseDirectory
    this.#fileExtensions = fileExtensions
    this.#tsConfigFilePath = tsConfigFilePath
    this.#getModule = getModule
  }

  async getFile(
    path: string | string[],
    extension?: FileExtensions[number] | FileExtensions[number][]
  ): Promise<FileForExtension<FileExports, FileExtensions> | undefined> {
    const filePath =
      this.#basePath && Array.isArray(path)
        ? join(this.#basePath, ...path)
        : path
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
        if (
          javascriptLikeExtensions.includes(
            extension as JavaScriptLikeExtensions
          )
        ) {
          return file as JavaScriptFile<FileExports>
        }

        return file as FileForExtension<FileExports, FileExtensions>
      }
    }
    return undefined
  }

  async getEntries(): Promise<FileSystemEntry<FileExports>[]> {
    const directoryEntries = await readdir(
      this.#basePath ? this.#basePath : process.cwd(),
      { withFileTypes: true }
    )
    const entries: FileSystemEntry<FileExports>[] = []

    for (const entry of directoryEntries) {
      const entryPath = this.#basePath
        ? join(this.#basePath, entry.name)
        : entry.name

      if (
        this.#tsConfigFilePath &&
        isFilePathExcludedFromTsConfig(entryPath, this.#tsConfigFilePath)
      ) {
        continue
      }

      if (entry.isDirectory()) {
        entries.push(
          new Directory(
            this.#fileExtensions,
            entryPath,
            this.#baseDirectory,
            this.#tsConfigFilePath,
            this.#getModule
          )
        )
      } else if (entry.isFile()) {
        const extension = extname(entry.name).slice(1)

        if (
          !this.#fileExtensions ||
          this.#fileExtensions.includes(extension as any)
        ) {
          if (
            javascriptLikeExtensions.includes(
              extension as JavaScriptLikeExtensions
            )
          ) {
            entries.push(
              new JavaScriptFile(
                this,
                entryPath,
                this.#baseDirectory,
                this.#getModule
              )
            )
          } else {
            entries.push(new File(this, entryPath, this.#baseDirectory))
          }
        }
      }
    }

    return entries
  }

  async getSiblings(
    entry: File | Directory
  ): Promise<[File | Directory | undefined, File | Directory | undefined]> {
    const entries = await this.getEntries()
    const index = entries.findIndex(
      (entryToCompare) => entryToCompare.getPath() === entry.getPath()
    )
    const previousEntry = index > 0 ? entries[index - 1] : undefined
    const nextEntry =
      index < entries.length - 1 ? entries[index + 1] : undefined

    return [previousEntry, nextEntry]
  }

  getName() {
    return this.#basePath ? basename(this.#basePath) : ''
  }

  getPath() {
    return this.#baseDirectory
      ? this.#basePath
        ? relative(this.#baseDirectory, this.#basePath)
        : this.#baseDirectory
      : this.#basePath
  }
}

export type CollectionOptions<
  FileExports extends ModuleExports = ModuleExports,
  FileExtensions extends Extract<keyof FileExports, string>[] = Extract<
    keyof FileExports,
    string
  >[],
> = {
  fileExtensions: FileExtensions
  baseDirectory?: string
} & (IsJavaScriptLikeExtensions<FileExtensions> extends true
  ? {
      tsConfigFilePath?: string
      getModule?: (path: string) => Promise<any>
    }
  : {})

/** A collection of files and directories for a specific base directory and file extensions. */
export class Collection<
  const FileExports extends ModuleExports = ModuleExports,
  const FileExtensions extends Extract<keyof FileExports, string>[] = Extract<
    keyof FileExports,
    string
  >[],
> extends Directory<FileExports, NoInfer<FileExtensions>> {
  options: CollectionOptions<FileExports, FileExtensions>

  constructor(options: CollectionOptions<FileExports, FileExtensions>) {
    super(
      options.fileExtensions as unknown as FileExtensions[],
      options.baseDirectory,
      options.baseDirectory,
      'tsConfigFilePath' in options ? options.tsConfigFilePath : undefined,
      'getModule' in options ? options.getModule : undefined
    )

    this.options = options
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

const tsConfigs = new Map<string, any>()

/** Parse and cache tsconfig.json files */
function getTsConfig(tsConfigFilePath: string) {
  // TODO: Handle tsconfig.json files that extend other tsconfig.json files
  if (tsConfigs.has(tsConfigFilePath)) {
    return tsConfigs.get(tsConfigFilePath)
  }

  const tsConfigContents = readFileSync(tsConfigFilePath, 'utf-8')
  const parsedTsConfig = JSON.parse(tsConfigContents)

  tsConfigs.set(tsConfigFilePath, parsedTsConfig)

  return parsedTsConfig
}

/** Check if a file path is excluded from a tsconfig.json file */
function isFilePathExcludedFromTsConfig(
  filePath: string,
  tsConfigFilePath: string
) {
  const tsConfig = getTsConfig(tsConfigFilePath)

  if (tsConfig.exclude?.length) {
    for (const exclude of tsConfig.exclude) {
      if (minimatch(filePath, exclude)) {
        return true
      }
    }
  }

  return false
}
