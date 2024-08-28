import * as React from 'react'
import type { MDXContent } from 'mdx/types'
import {
  Project,
  Directory,
  Node,
  SourceFile,
  type ExportedDeclarations,
} from 'ts-morph'
import { getSymbolDescription } from '@tsxmod/utils'
import { dirname, resolve } from 'node:path'
import globParent from 'glob-parent'
import parseTitle from 'title'

import { createSlug } from '../utils/create-slug'
import { filePathToPathname } from '../utils/file-path-to-pathname'
import { getExportedDeclaration } from '../utils/get-exported-declaration'
import { resolveType } from '../utils/resolve-type'
import {
  getDeclarationLocation,
  type DeclarationPosition,
} from './get-declaration-location'
import { getDirectorySourceFile } from './get-directory-source-file'
import { getEditPath } from './get-edit-path'
import { getGitMetadata } from './get-git-metadata'
import { getSourcePathMap } from './get-source-files-path-map'
import { getSourceFilesOrderMap } from './get-source-files-sort-order'
import { getImportMap, setImportMap } from './import-maps'
import { resolveTsConfigPath } from './resolve-ts-config-path'

export type { MDXContent }

export type FilePatterns<Extension extends string = string> =
  | `${string}${Extension}`
  | `${string}${Extension}${string}`

export interface FileExports {
  [key: string]: any
}

export interface BaseSource {
  /**
   * The full path to the source formatted to be URL-friendly, taking the
   * collection `baseDirectory` and `basePath` configuration into account.
   */
  getPath(): string

  /**
   * An array of path segments to the source excluding the collection `basePath`
   * if configured.
   */
  getPathSegments(): string[]

  /**
   * The path to the source on the local filesystem in development
   * and the git repository in production if configured.
   */
  getEditPath(): string
}

type PositiveIntegerOrInfinity<Type extends number> = `${Type}` extends
  | `-${string}`
  | `${string}.${string}`
  ? never
  : Type

export interface BaseSourceWithGetters<Exports extends FileExports>
  extends BaseSource {
  /** Retrieves a source in the immediate directory or sub-directory by its path. */
  getSource(path?: string | string[]): FileSystemSource<Exports> | undefined

  /**
   * Retrieves sources in the immediate directory and possibly sub-directories based on the provided `depth`.
   * Defaults to a depth of `Infinity` which will return all sources.
   */
  getSources<Depth extends number>(options?: {
    depth?: PositiveIntegerOrInfinity<Depth>
  }): Promise<FileSystemSource<Exports>[]>
}

export interface ExportSource<Value> extends BaseSource {
  /** The name of the exported source. If the default export name cannot be derived, the file name will be used. */
  getName(): string

  /** The name formatted as a title. */
  getTitle(): string

  /** The resolved type of the exported source based on the TypeScript type if it exists. */
  getType(): Promise<ReturnType<typeof resolveType>>

  /** The description of the exported source based on the JSDoc comment if it exists. */
  getDescription(): string | undefined

  /** The URL-friendly slug of the export name. */
  getSlug(): string

  /** A text representation of the exported source if it is statically analyzable. */
  getText(): string

  /**
   * The runtime value of the export loaded from a dynamic import map generated in the `.mdxts` directory at the root of the project.
   * Note, any side-effects in modules of targeted files will be run.
   */
  getValue(): Promise<Value>

  /** The execution environment of the export source. */
  getEnvironment(): 'server' | 'client' | 'isomorphic' | 'unknown'

  /** The lines and columns where the export starts and ends. */
  getPosition(): DeclarationPosition

  /** The previous and next export sources within the same file. */
  getSiblings(): Promise<
    [previous?: ExportSource<Value>, next?: ExportSource<Value>]
  >

  /** Whether the export is considered the main export of the file based on the name matching the file name or directory name. */
  isMainExport(): boolean
}

export interface FileSystemSource<Exports extends FileExports>
  extends BaseSourceWithGetters<Exports> {
  /** The base file name or directory name. */
  getName(): string

  /** The name formatted as a title. */
  getTitle(): string

  /** Order of the source in the collection based on its position in the file system. */
  getOrder(): string

  /** Depth of source starting from the collection. */
  getDepth(): number

  /** Date the source was first created. */
  getCreatedAt(): Promise<Date | undefined>

  /** Date the source was last updated. */
  getUpdatedAt(): Promise<Date | undefined>

  /** Authors who have contributed to the source. */
  getAuthors(): Promise<string[]>

  /** The previous and next sources in the collection if they exist. Defaults to a depth of `Infinity` which considers all descendants. */
  getSiblings(options?: {
    depth?: number
  }): Promise<
    [previous?: FileSystemSource<Exports>, next?: FileSystemSource<Exports>]
  >

  /** The default export source. */
  getDefaultExport(): ExportSource<Exports['default']>

  /** A single named export source of the file. */
  getNamedExport<Name extends Exclude<keyof Exports, 'default'>>(
    name: Name
  ): ExportSource<Exports[Name]>

  /** The main export source of the file based on the file name or directory name. */
  getMainExport(): ExportSource<Exports[keyof Exports]> | undefined

  /** All exported sources of the file. */
  getExports(): ExportSource<Exports[keyof Exports]>[]

  /** If the source is a file. */
  isFile(): boolean

  /** If the source is a directory. */
  isDirectory(): boolean
}

export type CollectionSource<Exports extends FileExports> = {
  /** Get the configured collection title. */
  getTitle(): string | undefined
} & Omit<BaseSourceWithGetters<Exports>, 'getEditPath' | 'getPathSegments'>

export interface CollectionOptions<Exports extends FileExports> {
  /** The title used for the collection when rendered for a page. */
  title?: string

  /** The label used for the collection when rendered as a navigation item. Defaults to the title. */
  label?: string

  /**
   * The base directory used when calculating source paths. This is useful in monorepos where
   * source files can be located outside of the workspace.
   */
  baseDirectory?: string

  /**
   * The base pathname used when calculating navigation paths. This includes everything after
   * the hostname (e.g. `/docs` in `https://mdxts.com/docs`).
   */
  basePath?: string

  /** The path to the TypeScript config file. */
  tsConfigFilePath?: string

  /** A custom sort function for ordering sources. */
  sort?: (
    a: FileSystemSource<Exports>,
    b: FileSystemSource<Exports>
  ) => Promise<number>

  /** Validate and transform exported values from source files. */
  schema?: {
    [Name in keyof Exports]?: (value: Exports[Name]) => Exports[Name]
  }
}

const projectCache = new Map<string, Project>()

function resolveProject(tsConfigFilePath: string): Project {
  if (!projectCache.has(tsConfigFilePath)) {
    const project = new Project({
      skipAddingFilesFromTsConfig: true,
      tsConfigFilePath,
    })
    projectCache.set(tsConfigFilePath, project)
  }
  return projectCache.get(tsConfigFilePath)!
}

abstract class Export<Value, AllExports extends FileExports = FileExports>
  implements ExportSource<Value>
{
  constructor(
    protected source: Source<AllExports>,
    protected exportDeclaration: ExportedDeclarations | undefined,
    protected isDefaultExport: boolean = false
  ) {}

  abstract getName(): string

  isMainExport(): boolean {
    const mainExport = this.source.getMainExport()
    return mainExport ? this === mainExport : false
  }

  getTitle() {
    return parseTitle(this.getName())
  }

  getText() {
    if (!this.exportDeclaration) {
      throw new Error(
        `[mdxts] Export could not be statically analyzed from source file at "${this.source.getPath()}".`
      )
    }

    if (Node.isVariableDeclaration(this.exportDeclaration)) {
      return this.exportDeclaration.getParentOrThrow().getText()
    }

    return this.exportDeclaration.getText()
  }

  async getType() {
    if (!this.exportDeclaration) {
      throw new Error(
        `[mdxts] Export could not be statically analyzed from source file at "${this.source.getPath()}".`
      )
    }

    // TODO: move type processing to web socket server

    return resolveType(this.exportDeclaration.getType(), this.exportDeclaration)
  }

  getDescription() {
    if (!this.exportDeclaration) {
      throw new Error(
        `[mdxts] Export could not be statically analyzed from source file at "${this.source.getPath()}".`
      )
    }

    const symbol = this.exportDeclaration.getSymbol()

    if (symbol) {
      return getSymbolDescription(symbol) ?? undefined
    }
  }

  getEnvironment() {
    if (!this.exportDeclaration) {
      throw new Error(
        `[mdxts] Export could not be statically analyzed from source file at "${this.source.getPath()}".`
      )
    }
    for (const importDeclaration of this.exportDeclaration
      .getSourceFile()
      .getImportDeclarations()) {
      const specifier = importDeclaration.getModuleSpecifierValue()
      if (specifier === 'server-only') {
        return 'server'
      }
      if (specifier === 'client-only') {
        return 'client'
      }
    }
    return 'isomorphic'
  }

  getSlug() {
    return createSlug(this.getName())
  }

  getPath() {
    const collection = this.source.getCollection()
    const filePath = this.exportDeclaration
      ? this.exportDeclaration.getSourceFile().getFilePath()
      : this.source.getSourceFile().getFilePath()

    return filePathToPathname(
      filePath,
      collection.options.baseDirectory,
      collection.options.basePath
    )
  }

  getPathSegments(): string[] {
    return this.source.getPathSegments().concat(this.getName() || [])
  }

  getEditPath() {
    if (!this.exportDeclaration) {
      throw new Error(
        `[mdxts] Export could not be statically analyzed from source file at "${this.source.getPath()}".`
      )
    }

    const filePath =
      process.env.NODE_ENV === 'development'
        ? this.source.getSourceFile().getFilePath()
        : getDeclarationLocation(this.exportDeclaration).filePath
    const position = this.getPosition()

    return getEditPath(filePath, position.start.line, position.start.column)
  }

  getPosition() {
    if (!this.exportDeclaration) {
      throw new Error(
        `[mdxts] Export could not be statically analyzed from source file at "${this.source.getPath()}".`
      )
    }
    return getDeclarationLocation(this.exportDeclaration).position
  }

  async getValue(): Promise<Value> {
    const moduleExports = await this.source.getModuleExports()
    const name = this.isDefaultExport ? 'default' : this.getName()
    let exportValue = moduleExports![name]

    /* Apply validation if schema is provided. */
    const collection = this.source.getCollection()

    if (collection.options.schema) {
      const parseExportValue = collection.options.schema[name]

      if (parseExportValue) {
        try {
          exportValue = parseExportValue(exportValue)
        } catch (error) {
          if (error instanceof Error) {
            throw new Error(
              `[mdxts] Failed to parse export "${name}" using schema for file "${this.source.getPath()}" \n\n${
                error.message
              }`,
              { cause: error }
            )
          }
        }
      }
    }

    /* Enable hot module reloading in development for Next.js component exports. */
    if (process.env.NODE_ENV === 'development') {
      const isReactComponent = /react.*jsx|jsx.*react/i.test(
        String(exportValue)
      )

      if (isReactComponent) {
        const Component = exportValue as React.ComponentType
        const WrappedComponent = async (props: Record<string, unknown>) => {
          const { Refresh } = await import('./Refresh')

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

    return exportValue as Value
  }

  async getSiblings(): Promise<
    [previous?: Export<Value, AllExports>, next?: Export<Value, AllExports>]
  > {
    const sourceExports = this.source.getExports()
    const currentIndex = sourceExports.findIndex(
      (exportItem) => exportItem.getName() === this.getName()
    )

    if (currentIndex === -1) {
      return [undefined, undefined]
    }

    const previousExport = sourceExports[currentIndex - 1]
    const nextExport = sourceExports[currentIndex + 1]

    return [
      previousExport as Export<Value, AllExports> | undefined,
      nextExport as Export<Value, AllExports> | undefined,
    ]
  }
}

class DefaultExport<AllExports extends FileExports>
  extends Export<AllExports['default'], AllExports>
  implements ExportSource<AllExports['default']>
{
  constructor(
    source: Source<AllExports>,
    exportDeclaration: ExportedDeclarations | undefined
  ) {
    super(source, exportDeclaration, true)
  }

  getName() {
    const name = this.exportDeclaration
      ? getDeclarationName(this.exportDeclaration) || this.source.getName()
      : undefined

    // Use the source name as the default export name if it is not defined
    if (name === undefined) {
      return this.source.getName()
    }

    return name
  }
}

class NamedExport<
    AllExports extends FileExports,
    Name extends Exclude<keyof AllExports, 'default'>
  >
  extends Export<AllExports[Name], AllExports>
  implements ExportSource<AllExports[Name]>
{
  constructor(
    source: Source<AllExports>,
    private exportName: Name,
    exportDeclaration: ExportedDeclarations | undefined
  ) {
    super(source, exportDeclaration)
  }

  getName() {
    return this.exportName as string
  }
}

class Source<AllExports extends FileExports>
  implements FileSystemSource<AllExports>
{
  #sourcePath: string

  constructor(
    private collection: Collection<AllExports>,
    private sourceFileOrDirectory: SourceFile | Directory
  ) {
    this.#sourcePath = getFileSystemSourcePath(this.sourceFileOrDirectory)
  }

  isFile() {
    return this.sourceFileOrDirectory instanceof SourceFile
  }

  isDirectory() {
    return this.sourceFileOrDirectory instanceof Directory
  }

  getCollection() {
    return this.collection
  }

  getName() {
    const baseName =
      this.sourceFileOrDirectory instanceof Directory
        ? this.sourceFileOrDirectory.getBaseName()
        : this.sourceFileOrDirectory.getBaseNameWithoutExtension()
    let name = baseName
      // remove leading numbers e.g. 01.intro -> intro
      .replace(/^\d+\./, '')

    if (
      (name === 'index' || name === 'readme') &&
      this.sourceFileOrDirectory instanceof SourceFile
    ) {
      name = this.sourceFileOrDirectory
        .getDirectory()
        .getBaseName()
        // remove leading numbers e.g. 01.intro -> intro
        .replace(/^\d+\./, '')
    }

    return name.split('.').at(0)!
  }

  getTitle() {
    return (
      parseTitle(this.getName())
        // remove hyphens e.g. my-component -> my component
        .replace(/-/g, ' ')
    )
  }

  getPath() {
    const calculatedPath = this.collection.sourcePathMap.get(this.#sourcePath)

    if (!calculatedPath) {
      throw new Error(
        `[mdxts] Could not calculate depth. Source path not found for file path "${
          this.#sourcePath
        }".`
      )
    }

    if (calculatedPath.endsWith('/index')) {
      return calculatedPath.slice(0, -6)
    }

    if (calculatedPath.endsWith('/readme')) {
      return calculatedPath.slice(0, -7)
    }

    return calculatedPath
  }

  getPathSegments() {
    const basePath = this.collection.options.basePath

    return this.getPath()
      .split('/')
      .filter(
        (segment) =>
          segment !== basePath &&
          segment !== '' &&
          segment !== 'index' &&
          segment !== 'readme'
      )
  }

  getEditPath() {
    return getEditPath(this.#sourcePath)
  }

  getDepth() {
    return getPathDepth(this.getPath())
  }

  getOrder() {
    const order = this.collection.sourceFilesOrderMap.get(this.#sourcePath)

    if (order === undefined) {
      throw new Error(
        `[mdxts] Source file order not found for file path "${
          this.#sourcePath
        }". If you see this error, please file an issue.`
      )
    }

    return order
  }

  async getCreatedAt() {
    const gitMetadata = await getGitMetadata(this.#sourcePath)
    return gitMetadata.createdAt ? new Date(gitMetadata.createdAt) : undefined
  }

  async getUpdatedAt() {
    const gitMetadata = await getGitMetadata(this.#sourcePath)
    return gitMetadata.updatedAt ? new Date(gitMetadata.updatedAt) : undefined
  }

  async getAuthors() {
    const gitMetadata = await getGitMetadata(this.#sourcePath)
    return gitMetadata.authors
  }

  getSource(path: string | string[]) {
    const currentPath = this.getPath()
    const fullPath = Array.isArray(path)
      ? `${currentPath}/${path.join('/')}`
      : `${currentPath}/${path}`

    return this.collection.getSource(fullPath)
  }

  async getSources({ depth = Infinity }: { depth?: number } = {}) {
    if (!isValidDepth(depth)) {
      throw new Error(
        `[mdxts] Invalid depth "${depth}" provided for source at path "${this.getPath()}". Depth must be a positive integer or Infinity.`
      )
    }

    const currentPath = this.getPath()
    const currentDepth = this.getDepth()
    const maxDepth = depth === Infinity ? Infinity : currentDepth + depth

    return (await this.collection.getFileSystemSources()).filter((source) => {
      if (source) {
        const descendantPath = source.getPath()
        const descendantDepth = source.getDepth()

        return (
          descendantPath.startsWith(currentPath) &&
          descendantDepth > currentDepth &&
          descendantDepth <= maxDepth
        )
      }
    }) as FileSystemSource<AllExports>[]
  }

  async getSiblings({
    depth = Infinity,
  }: {
    depth?: number
  } = {}): Promise<
    [
      previous?: FileSystemSource<AllExports> | undefined,
      next?: FileSystemSource<AllExports> | undefined
    ]
  > {
    if (!isValidDepth(depth)) {
      throw new Error(
        `[mdxts] Invalid depth "${depth}" provided for source siblings at path "${this.getPath()}". Depth must be a positive integer or Infinity.`
      )
    }

    const minDepth = this.collection.getDepth()
    const maxDepth = depth === Infinity ? Infinity : this.getDepth() + depth
    const seenPaths = new Set<string>()
    const filteredSources = (
      await this.collection.getFileSystemSources()
    ).filter((source) => {
      const sourcePath = source.getPath()
      if (seenPaths.has(sourcePath)) {
        return false
      }
      seenPaths.add(sourcePath)

      const sourceDepth = source.getDepth()
      return sourceDepth >= minDepth && sourceDepth <= maxDepth
    })
    const currentIndex = filteredSources.findIndex(
      (source) => source.getPath() === this.getPath()
    )

    if (currentIndex === -1) {
      return [undefined, undefined]
    }

    const previousSource = filteredSources[currentIndex - 1]
    const nextSource = filteredSources[currentIndex + 1]

    return [previousSource, nextSource]
  }

  getDefaultExport(): ExportSource<AllExports['default']> {
    const sourceFile = this.sourceFileOrDirectory

    if (sourceFile instanceof Directory) {
      const baseName = sourceFile.getBaseName()
      const validExtensions = Array.from(this.collection.validExtensions)

      throw new Error(
        `[mdxts] "getDefaultExport" was called for the directory "${baseName}" which does not have an associated index or readme file.

You can fix this error by taking one of the following actions:
  - Filter the source:
    Before calling "getDefaultExport", check if the source is a directory by using "isDirectory".
  
  - Add an index or README file to the "${baseName}" directory:
    . Ensure the file has a valid extension based on the targeted file patterns of this collection: ${validExtensions.join(
      ', '
    )}
    . Define a default export in the file or ensure the default export exists if compiled.
    
  - Handle the error:
    Catch and manage this error in your code to prevent it from causing a failure.`
      )
    }

    const defaultDeclaration = getExportedDeclaration(
      sourceFile.getExportedDeclarations(),
      'default'
    )

    return new DefaultExport<AllExports>(this, defaultDeclaration)
  }

  getNamedExport<Name extends Exclude<keyof AllExports, 'default'>>(
    name: Name
  ) {
    const exportName = name as string
    const sourceFile = this.sourceFileOrDirectory

    if (sourceFile instanceof Directory) {
      const baseName = sourceFile.getBaseName()
      const validExtensions = Array.from(this.collection.validExtensions)

      throw new Error(
        `[mdxts] "getNamedExport('${name.toString()}')" was called for the directory "${baseName}" which does not have an associated index or readme file.

You can fix this error by taking one of the following actions:
  - Filter the source:
    Before calling "getNamedExport", check if the source is a directory by using "isDirectory".
  
  - Add an index or README file to the "${baseName}" directory:
    . Ensure the file has a valid extension based on the targeted file patterns of this collection: ${validExtensions.join(
      ', '
    )}
    . Define a named export of "${name.toString()}" in the file or ensure the named export exists if compiled.
    
  - Handle the error:
    Catch and manage this error in your code to prevent it from causing a failure.`
      )
    }

    const exportDeclaration = getExportedDeclaration(
      sourceFile.getExportedDeclarations(),
      exportName
    )

    return new NamedExport<AllExports, Name>(this, name, exportDeclaration)
  }

  getMainExport() {
    const baseName = this.getSourceFile().getBaseNameWithoutExtension()

    return this.getExports().find((exportSource) => {
      return (
        exportSource.getName() === baseName ||
        exportSource.getSlug() === baseName
      )
    })
  }

  getExports() {
    let sourceFile: SourceFile

    if (this.sourceFileOrDirectory instanceof Directory) {
      sourceFile = getDirectorySourceFile(this.sourceFileOrDirectory)!
    } else {
      sourceFile = this.sourceFileOrDirectory
    }

    if (!sourceFile) {
      const baseName = this.sourceFileOrDirectory.getBaseName()
      const validExtensions = Array.from(this.collection.validExtensions)

      throw new Error(
        `[mdxts] Directory "${baseName}" at path "${this.getPath()}" does not have an associated source file.

You can fix this error by taking one of the following actions:
  - Filter the source:
    Before calling "getExports", check if the source is a directory by using "isDirectory" e.g. (await <collection>.getSources()).filter(source => !source.isDirectory()).
  
  - Add an index or README file to the "${baseName}" directory:
    . Ensure the file has a valid extension based on the targeted file patterns of this collection: ${validExtensions.join(
      ', '
    )}
    
  - Handle the error:
    Catch and manage this error in your code to prevent it from causing a failure.`
      )
    }

    return sourceFile.getExportSymbols().map((symbol) => {
      const name = symbol.getName()

      if (name === 'default') {
        return this.getDefaultExport()
      }

      return this.getNamedExport(name as Exclude<keyof AllExports, 'default'>)
    })
  }

  getSourceFile() {
    if (this.sourceFileOrDirectory instanceof SourceFile) {
      return this.sourceFileOrDirectory
    }
    throw new Error(
      `[mdxts] Expected a source file but got a directory at "${
        this.#sourcePath
      }".`
    )
  }

  async getModuleExports() {
    const sourceFile = this.getSourceFile()
    const slugExtension = sourceFile.getExtension().slice(1)
    const importKey = `${slugExtension}:${this.collection.filePattern}`
    const getImport = getImportMap<AllExports>(importKey)

    if (!getImport) {
      throw new Error(
        `[mdxts] No source found for path "${this.getPath()}" at file pattern "${
          this.collection.filePattern
        }":

You can fix this error by ensuring the following:
  
  - The ".mdxts" directory was successfully created and your tsconfig.json file aliases "mdxts" to ".mdxts/index.js" correctly.
  - The file pattern is formatted correctly and targeting files that exist.
  - Try refreshing the page or restarting server.
  - If you continue to see this error, please file an issue: https://github.com/souporserious/mdxts/issues`
      )
    }

    return getImport(this.collection.getImportSlug(sourceFile))
  }
}

class Collection<AllExports extends FileExports>
  implements CollectionSource<AllExports>
{
  public filePattern: string
  public options: CollectionOptions<AllExports>
  public project: Project
  public absoluteGlobPattern: string
  public absoluteBaseGlobPattern: string
  public fileSystemSources: (SourceFile | Directory)[]
  public sourceFilesOrderMap: Map<string, string>
  public sourcePathMap: Map<string, string>
  public validExtensions: Set<string> = new Set()

  #sources = new Map<string, Source<AllExports>>()

  constructor(
    filePattern: string,
    options: CollectionOptions<AllExports> = {}
  ) {
    this.filePattern = filePattern
    this.options = options
    this.project = resolveProject(options.tsConfigFilePath ?? 'tsconfig.json')

    const compilerOptions = this.project.getCompilerOptions()
    const tsConfigFilePath = String(compilerOptions.configFilePath)
    const tsConfigDirectory = dirname(tsConfigFilePath)
    const resolvedGlobPattern =
      compilerOptions.baseUrl && compilerOptions.paths
        ? resolveTsConfigPath(
            tsConfigFilePath,
            compilerOptions.baseUrl,
            compilerOptions.paths,
            filePattern
          )
        : filePattern
    this.absoluteGlobPattern = resolve(tsConfigDirectory, resolvedGlobPattern)
    this.absoluteBaseGlobPattern = globParent(this.absoluteGlobPattern)

    const fileSystemSources = getSourceFilesAndDirectories(
      this.project,
      this.absoluteGlobPattern
    )

    if (fileSystemSources.length === 0) {
      throw new Error(
        `[mdxts] No source files or directories were found for the file pattern: ${filePattern}`
      )
    }

    this.fileSystemSources = fileSystemSources
    this.validExtensions = new Set(
      fileSystemSources
        .map((source) => {
          if (source instanceof SourceFile) {
            return source.getExtension().slice(1)
          }
        })
        .filter(Boolean) as string[]
    )

    const baseDirectory = this.project.getDirectoryOrThrow(
      this.absoluteBaseGlobPattern
    )
    this.sourceFilesOrderMap = getSourceFilesOrderMap(baseDirectory)
    this.sourcePathMap = getSourcePathMap(baseDirectory, {
      baseDirectory: options.baseDirectory,
      basePath: options.basePath,
    })
  }

  getFileSystemSource(sourceFileOrDirectory: SourceFile | Directory) {
    const path = this.sourcePathMap.get(
      getFileSystemSourcePath(sourceFileOrDirectory)
    )!
    return this.getSource(path)
  }

  async getFileSystemSources() {
    const sources = this.fileSystemSources
      .map((fileSystemSource) => {
        // Filter out directories that have an index or readme file
        if (fileSystemSource instanceof Directory) {
          const directorySourceFile = getDirectorySourceFile(fileSystemSource)

          if (directorySourceFile) {
            return
          }
        }

        return this.getFileSystemSource(fileSystemSource)
      })
      .filter(Boolean) as FileSystemSource<AllExports>[]

    sources.sort((a, b) => a.getOrder().localeCompare(b.getOrder()))

    if (this.options.sort) {
      try {
        const sourcesCount = sources.length

        for (
          let sourceIndex = 0;
          sourceIndex < sourcesCount - 1;
          sourceIndex++
        ) {
          for (
            let sourceCompareIndex = 0;
            sourceCompareIndex < sourcesCount - 1 - sourceIndex;
            sourceCompareIndex++
          ) {
            if (
              (await this.options.sort(
                sources[sourceCompareIndex],
                sources[sourceCompareIndex + 1]
              )) > 0
            ) {
              const compareSource = sources[sourceCompareIndex]
              sources[sourceCompareIndex] = sources[sourceCompareIndex + 1]
              sources[sourceCompareIndex + 1] = compareSource
            }
          }
        }
      } catch (error) {
        const badge = '[mdxts] '
        if (error instanceof Error && error.message.includes(badge)) {
          throw new Error(
            `[mdxts] Error occurred while sorting sources for collection with file pattern "${
              this.filePattern
            }". \n\n${error.message.slice(badge.length)}`
          )
        }
        throw error
      }
    }

    return sources
  }

  getTitle() {
    if (!this.options.title) {
      throw new Error(
        `[mdxts] No title provided for collection with file pattern "${this.filePattern}".`
      )
    }
    return parseTitle(this.options.title)
  }

  getPath() {
    if (this.options.basePath) {
      return this.options.basePath.startsWith('/')
        ? this.options.basePath
        : `/${this.options.basePath}`
    }
    return '/'
  }

  getDepth() {
    return this.options.basePath ? getPathDepth(this.options.basePath) : -1
  }

  getSource(
    path: string | string[] = 'index'
  ): FileSystemSource<AllExports> | undefined {
    let pathString = Array.isArray(path) ? path.join('/') : path

    if (this.#sources.has(pathString)) {
      return this.#sources.get(pathString)
    }

    // ensure the path starts with a slash
    if (!pathString.startsWith('/')) {
      pathString = `/${pathString}`
    }

    // prepend the collection base path if it exists and the path does not already start with it
    if (this.options.basePath) {
      if (!pathString.startsWith(`/${this.options.basePath}`)) {
        pathString = `/${this.options.basePath}${pathString}`
      }
    }

    let sourceFileOrDirectory = this.fileSystemSources.find((source) => {
      const fileSystemSourcePath = getFileSystemSourcePath(source)
      const sourcePath = this.sourcePathMap.get(fileSystemSourcePath)
      return sourcePath === pathString
    })

    if (sourceFileOrDirectory instanceof Directory) {
      const directorySourceFile = getDirectorySourceFile(sourceFileOrDirectory)

      if (directorySourceFile) {
        sourceFileOrDirectory = directorySourceFile
      }
    }

    if (!sourceFileOrDirectory) {
      return undefined
    }

    const source = new Source(this, sourceFileOrDirectory)

    this.#sources.set(pathString, source)

    return source
  }

  async getSources({ depth = Infinity }: { depth?: number } = {}) {
    if (!isValidDepth(depth)) {
      throw new Error(
        `[mdxts] Invalid depth "${depth}" provided for collection with file pattern "${this.filePattern}". Depth must be a positive integer or Infinity.`
      )
    }

    const minDepth = this.getDepth()
    const maxDepth = depth === Infinity ? Infinity : minDepth + depth
    const sources = await this.getFileSystemSources()
    const seenPaths = new Set<string>()

    return sources.filter((source) => {
      const sourcePath = source.getPath()
      if (seenPaths.has(sourcePath)) {
        return false
      }
      seenPaths.add(sourcePath)

      if (source) {
        const descendantDepth = source.getDepth()
        return descendantDepth > minDepth && descendantDepth <= maxDepth
      }
    }) as FileSystemSource<AllExports>[]
  }

  getImportSlug(source: SourceFile | Directory) {
    return (
      getFileSystemSourcePath(source)
        // remove the base glob pattern: /src/posts/welcome.mdx -> /posts/welcome.mdx
        .replace(this.absoluteBaseGlobPattern, '')
        // remove leading slash: /posts/welcome.mdx -> posts/welcome.mdx
        .replace(/^\//, '')
        // remove file extension: Button.tsx -> Button
        .replace(/\.[^/.]+$/, '')
    )
  }
}

/**
 * Creates a collection of sources based on a specified file pattern.
 * Note, an import getter for each file extension will be generated at the root of the project in a `.mdxts/index.js` file.
 *
 * @param filePattern - A pattern to match a set of source files (e.g., "*.ts", "*.mdx").
 * @param options - Optional settings for the collection, including base directory, base path, TypeScript config file path, and a custom sort function.
 * @returns A collection object that provides methods to retrieve individual sources or all sources matching the pattern.
 */
export function createCollection<
  AllExports extends { [key: string]: any } = { [key: string]: any },
  FilePattern extends FilePatterns = string
>(
  filePattern: FilePattern,
  options?: CollectionOptions<AllExports>
): CollectionSource<AllExports> {
  return new Collection<AllExports>(filePattern, options)
}

/**
 * Sets the import map of dynamic imports for all collection file patterns.
 * @internal
 */
createCollection.setImportMap = setImportMap

/** Get all sources for a file pattern. */
function getSourceFilesAndDirectories(
  project: Project,
  filePattern: string
): (SourceFile | Directory)[] {
  let sourceFiles = project.getSourceFiles(filePattern)

  if (sourceFiles.length === 0) {
    sourceFiles = project.addSourceFilesAtPaths(filePattern)
  }

  const fileSystemSources = new Set<SourceFile | Directory>(sourceFiles)
  const sourceDirectories = Array.from(
    new Set(sourceFiles.map((sourceFile) => sourceFile.getDirectory()))
  )

  for (const sourceDirectory of sourceDirectories) {
    fileSystemSources.add(sourceDirectory)
  }

  return Array.from(fileSystemSources)
}

/** Get the path of a source file or directory. */
function getFileSystemSourcePath(source: SourceFile | Directory) {
  if (source instanceof SourceFile) {
    return source.getFilePath()
  }
  return source.getPath()
}

/** Get the depth of a path relative to a base path. */
function getPathDepth(path: string, basePath?: string) {
  const segments = path.split('/').filter(Boolean)

  if (segments.at(0) === basePath) {
    return segments.length - 2
  }

  return segments.length - 1
}

/** Get the name of a declaration. */
function getDeclarationName(declaration: Node) {
  if (Node.isVariableDeclaration(declaration)) {
    return declaration.getNameNode().getText()
  } else if (Node.isFunctionDeclaration(declaration)) {
    return declaration.getName()
  } else if (Node.isClassDeclaration(declaration)) {
    return declaration.getName()
  }
}

/** Whether a depth value is zero, a positive integer, or Infinity. */
function isValidDepth(depth: number) {
  return (depth >= 0 && Number.isInteger(depth)) || depth === Infinity
}
