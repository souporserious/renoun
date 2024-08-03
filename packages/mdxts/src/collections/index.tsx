import type { MDXContent } from 'mdx/types'
import {
  Project,
  Directory,
  Node,
  SourceFile,
  type ExportedDeclarations,
} from 'ts-morph'
import AliasesFromTSConfig from 'aliases-from-tsconfig'
import globParent from 'glob-parent'
import parseTitle from 'title'

import {
  getDeclarationLocation,
  type DeclarationPosition,
} from './get-declaration-location'
import { getDirectorySourceFile } from './get-directory-source-file'
import { getGitMetadata } from './get-git-metadata'
import { getSourcePathMap } from './get-source-files-path-map'
import { getSourceFilesOrderMap } from './get-source-files-sort-order'
import { updateImportMap, getImportMap, setImports } from './import-maps'

export type { MDXContent }

export { setImports }

export type FilePatterns<Extension extends string = string> =
  | `${string}${Extension}`
  | `${string}${Extension}${string}`

export type FileExports = Record<string, unknown>

export interface BaseSource {
  /**
   * The path to the source, taking into account the `baseDirectory` and
   * `basePath` configuration, and formatted to be URL-friendly.
   */
  getPath(): string

  /**
   * The path to the source on the local filesystem in development
   * and the git repository in production if configured.
   */
  getEditPath(): string
}

export interface BaseSourceWithGetters<Exports extends FileExports>
  extends BaseSource {
  /** Retrieves a source in the directory by its path. */
  getSource(path: string | string[]): FileSystemSource<Exports> | undefined

  /** Retrieves all sources in the directory. */
  getSources(): FileSystemSource<Exports>[]
}

export interface ExportSource<Value> extends BaseSource {
  /** A text representation of the exported source if it is statically analyzable. */
  getText(): string

  /** The runtime value of the export. */
  getValue(): Promise<Value>

  /** The execution environment of the export source. */
  getEnvironment(): 'server' | 'client' | 'isomorphic' | 'unknown'

  /** The lines and columns where the export starts and ends. */
  getPosition(): DeclarationPosition
}

export interface DefaultExportSource<Value> extends ExportSource<Value> {
  /** The name of the source, which can be undefined for default exports. */
  getName(): string | undefined

  /** The name formatted as a title. */
  getTitle(): string | undefined
}

export interface NamedExportSource<Value> extends ExportSource<Value> {
  /** The name of the exported source. */
  getName(): string

  /** The name formatted as a title. */
  getTitle(): string
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

  /** The previous and next sources in the parent source if they exist. */
  getSiblings(): [
    previous?: FileSystemSource<Exports>,
    next?: FileSystemSource<Exports>,
  ]

  /** The default export source. */
  getDefaultExport(): DefaultExportSource<Exports['default']>

  /** A single named export source of the file. */
  getNamedExport<Name extends Exclude<keyof Exports, 'default'>>(
    name: Name
  ): NamedExportSource<Exports[Name]>

  /** All named export sources of the file. */
  getNamedExports(): NamedExportSource<Exports[keyof Exports]>[]
}

export type CollectionSource<Exports extends FileExports> = {
  /** Get the configured collection title. */
  getTitle(): string | undefined
} & BaseSourceWithGetters<Exports>

export interface CollectionOptions {
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
  sort?: (a: string, b: string) => number
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
    protected exportDeclaration: ExportedDeclarations | undefined
  ) {}

  abstract getName(): string | undefined

  getText() {
    if (!this.exportDeclaration) {
      throw new Error(
        `[mdxts] Export could not be statically analyzed from source file at "${this.source.getPath()}".`
      )
    }
    return this.exportDeclaration.getText()
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

  getPath() {
    const name = this.getName()
    const path = this.source.getPath()
    return name ? `${path}/${name}` : path
  }

  getEditPath() {
    if (!this.exportDeclaration) {
      throw new Error(
        `[mdxts] Export could not be statically analyzed from source file at "${this.source.getPath()}".`
      )
    }
    return getDeclarationLocation(this.exportDeclaration).filePath
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
    const name = this.getName() || 'default'
    const exportValue = moduleExports![name]
    if (exportValue === undefined) {
      throw new Error(
        `[mdxts] Export value is undefined for source file at "${this.source.getPath()}".`
      )
    }
    return exportValue as Value
  }
}

class DefaultExport<AllExports extends FileExports>
  extends Export<AllExports['default'], AllExports>
  implements DefaultExportSource<AllExports['default']>
{
  getName() {
    return this.exportDeclaration
      ? getDeclarationName(this.exportDeclaration) || this.source.getName()
      : undefined
  }

  getTitle() {
    const name = this.getName()
    return name ? parseTitle(name) : undefined
  }
}

class NamedExport<
    AllExports extends FileExports,
    Name extends Exclude<keyof AllExports, 'default'>,
  >
  extends Export<AllExports[Name], AllExports>
  implements NamedExportSource<AllExports[Name]>
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

  getTitle() {
    return parseTitle(this.getName())
  }
}

class Source<AllExports extends FileExports>
  implements FileSystemSource<AllExports>
{
  constructor(
    private collection: Collection<AllExports>,
    private sourceFileOrDirectory: SourceFile | Directory,
    private sourcePath: string,
    private exportedDeclarations: ReadonlyMap<string, ExportedDeclarations[]>
  ) {}

  getName() {
    const baseName =
      this.sourceFileOrDirectory instanceof Directory
        ? this.sourceFileOrDirectory.getBaseName()
        : this.sourceFileOrDirectory.getBaseNameWithoutExtension()

    return baseName.replace(/^\d+\./, '')
  }

  getTitle() {
    return parseTitle(this.getName()).replace(/-/g, ' ')
  }

  getPath() {
    const calculatedPath = this.collection.sourcePathMap.get(this.sourcePath)

    if (!calculatedPath) {
      throw new Error(
        `[mdxts] Could not calculate depth. Source path not found for file path "${this.sourcePath}".`
      )
    }

    return calculatedPath
  }

  getEditPath() {
    return this.sourcePath
  }

  getDepth() {
    return getPathDepth(this.getPath())
  }

  getOrder() {
    const order = this.collection.sourceFilesOrderMap.get(this.sourcePath)

    if (order === undefined) {
      throw new Error(
        `[mdxts] Source file order not found for file path "${this.sourcePath}".`
      )
    }

    return order
  }

  async getCreatedAt() {
    const gitMetadata = await getGitMetadata(this.sourcePath)
    return gitMetadata.createdAt ? new Date(gitMetadata.createdAt) : undefined
  }

  async getUpdatedAt() {
    const gitMetadata = await getGitMetadata(this.sourcePath)
    return gitMetadata.updatedAt ? new Date(gitMetadata.updatedAt) : undefined
  }

  async getAuthors() {
    const gitMetadata = await getGitMetadata(this.sourcePath)
    return gitMetadata.authors
  }

  getSource(path: string | string[]) {
    const currentPath = this.getPath()
    const fullPath = Array.isArray(path)
      ? `${currentPath}/${path.join('/')}`
      : `${currentPath}/${path}`

    return this.collection.getSource(fullPath)
  }

  getSources() {
    const path = this.getPath()
    const depth = this.getDepth()

    return this.collection.fileSystemSources
      .map((source) => {
        const path = this.collection.sourcePathMap.get(getSourcePath(source))!
        return this.collection.getSource(path)
      })
      .filter((source) => {
        if (source) {
          const descendantPath = source.getPath()
          const descendantDepth = source.getDepth()
          return (
            descendantPath.startsWith(path) && descendantDepth === depth + 1
          )
        }
      }) as FileSystemSource<AllExports>[]
  }

  getSiblings(): [
    previous?: FileSystemSource<AllExports> | undefined,
    next?: FileSystemSource<AllExports> | undefined,
  ] {
    const currentIndex = this.collection.fileSystemSources.findIndex(
      (source) => getSourcePath(source) === this.sourcePath
    )

    if (currentIndex === -1) {
      return [undefined, undefined]
    }

    const previousSource = this.collection.fileSystemSources[currentIndex - 1]
    const nextSource = this.collection.fileSystemSources[currentIndex + 1]

    const previous = previousSource
      ? this.collection.getSource(
          this.collection.sourcePathMap.get(getSourcePath(previousSource))!
        )
      : undefined

    const next = nextSource
      ? this.collection.getSource(
          this.collection.sourcePathMap.get(getSourcePath(nextSource))!
        )
      : undefined

    return [previous, next]
  }

  getDefaultExport(): DefaultExportSource<AllExports['default']> {
    const sourceFile = this.sourceFileOrDirectory

    if (sourceFile instanceof Directory) {
      throw new Error(
        `[mdxts] Directory at path "${this.sourcePath}" does not have a default export.`
      )
    }

    const defaultDeclaration = getExportedDeclaration(
      this.exportedDeclarations,
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
      throw new Error(
        `[mdxts] Directory at path "${this.sourcePath}" does not have a named export for "${exportName}".`
      )
    }

    const exportDeclaration = getExportedDeclaration(
      this.exportedDeclarations,
      exportName
    )

    return new NamedExport<AllExports, Name>(this, name, exportDeclaration)
  }

  getNamedExports() {
    let sourceFile: SourceFile

    if (this.sourceFileOrDirectory instanceof Directory) {
      sourceFile = getDirectorySourceFile(this.sourceFileOrDirectory)!
    } else {
      sourceFile = this.sourceFileOrDirectory
    }

    return sourceFile.getExportSymbols().map((symbol) => {
      const name = symbol.getName()
      return this.getNamedExport(name as Exclude<keyof AllExports, 'default'>)
    })
  }

  getSourceFile() {
    if (this.sourceFileOrDirectory instanceof SourceFile) {
      return this.sourceFileOrDirectory
    }
    throw new Error(
      `[mdxts] Expected a source file but got a directory at "${this.sourcePath}".`
    )
  }

  async getModuleExports() {
    const sourceFile = this.getSourceFile()
    const slugExtension = sourceFile.getExtension().slice(1)
    const importKey = `${slugExtension}:${this.collection.filePattern}`
    const getImport = getImportMap<AllExports>(importKey)

    if (!getImport) {
      throw new Error(
        `[mdxts] Import map not found for file pattern "${this.collection.filePattern}".`
      )
    }

    return getImport(this.collection.getImportSlug(sourceFile))
  }
}

class Collection<AllExports extends FileExports> {
  public filePattern: string
  public options: CollectionOptions
  public project: Project
  public absoluteGlobPattern: string
  public absoluteBaseGlobPattern: string
  public fileSystemSources: (SourceFile | Directory)[]
  public sourceFilesOrderMap: Map<string, string>
  public sourcePathMap: Map<string, string>

  constructor(filePattern: string, options: CollectionOptions = {}) {
    this.filePattern = filePattern
    this.options = options
    this.project = resolveProject(options.tsConfigFilePath ?? 'tsconfig.json')
    this.absoluteGlobPattern = new AliasesFromTSConfig(
      this.project.getCompilerOptions().configFilePath as string
    ).apply(filePattern)
    this.absoluteBaseGlobPattern = globParent(this.absoluteGlobPattern)

    const { fileSystemSources, sourceFiles } = getSourceFilesAndDirectories(
      this.project,
      this.absoluteGlobPattern
    )

    this.fileSystemSources = fileSystemSources

    if (fileSystemSources.length === 0) {
      throw new Error(
        `[mdxts] No source files or directories were found for the file pattern: ${filePattern}`
      )
    }

    updateImportMap(filePattern, sourceFiles)

    const baseDirectory = this.project.getDirectoryOrThrow(
      this.absoluteBaseGlobPattern
    )
    this.sourceFilesOrderMap = getSourceFilesOrderMap(baseDirectory)
    this.sourcePathMap = getSourcePathMap(baseDirectory, {
      baseDirectory: options.baseDirectory,
      basePath: options.basePath,
    })
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

  getEditPath() {
    return this.absoluteBaseGlobPattern.replace(process.cwd(), '')
  }

  getSource(path: string | string[]): FileSystemSource<AllExports> | undefined {
    let pathString = Array.isArray(path) ? path.join('/') : path

    if (!pathString.startsWith('/')) {
      pathString = `/${pathString}`
    }

    if (this.options.basePath) {
      if (!pathString.startsWith(`/${this.options.basePath}`)) {
        pathString = `/${this.options.basePath}${pathString}`
      }
    }

    const matchingSources = this.fileSystemSources.filter((sourceFile) => {
      const sourcePath = this.sourcePathMap.get(getSourcePath(sourceFile))!
      return sourcePath === pathString
    })

    if (matchingSources.length === 0) {
      return undefined
    }

    const sourceFileOrDirectory = matchingSources[0]!
    const sourcePath = getSourcePath(sourceFileOrDirectory)
    const isSourceFile = sourceFileOrDirectory instanceof SourceFile
    const exportedDeclarations = isSourceFile
      ? sourceFileOrDirectory.getExportedDeclarations()
      : new Map()

    return new Source(
      this,
      sourceFileOrDirectory,
      sourcePath,
      exportedDeclarations
    )
  }

  getSources() {
    const depthOffset = this.options.basePath
      ? getPathDepth(this.options.basePath) + 1
      : 1

    return this.fileSystemSources
      .map((source) => {
        const path = this.sourcePathMap.get(getSourcePath(source))!
        return this.getSource(path)
      })
      .filter(
        (source) => source?.getDepth() === depthOffset
      ) as FileSystemSource<AllExports>[]
  }

  getImportSlug(source: SourceFile | Directory) {
    return (
      getSourcePath(source)
        // remove the base glob pattern: /src/posts/welcome.mdx -> /posts/welcome.mdx
        .replace(this.absoluteBaseGlobPattern, '')
        // remove leading slash: /posts/welcome.mdx -> posts/welcome.mdx
        .replace(/^\//, '')
        // remove file extension: Button.tsx -> Button
        .replace(/\.[^/.]+$/, '')
    )
  }
}

export function createCollection<
  AllExports extends FilePattern extends FilePatterns<'md' | 'mdx'>
    ? { default: MDXContent; [key: string]: unknown }
    : { [key: string]: unknown },
  FilePattern extends FilePatterns = string,
>(
  filePattern: FilePattern,
  options?: CollectionOptions
): CollectionSource<AllExports> {
  return new Collection<AllExports>(filePattern, options)
}

/** Get all sources for a file pattern. */
function getSourceFilesAndDirectories(
  project: Project,
  filePattern: string
): {
  fileSystemSources: (SourceFile | Directory)[]
  sourceFiles: SourceFile[]
  sourceDirectories: Directory[]
} {
  let sourceFiles = project.getSourceFiles(filePattern)

  if (sourceFiles.length === 0) {
    sourceFiles = project.addSourceFilesAtPaths(filePattern)
  }

  const fileSystemSources = new Set<SourceFile | Directory>(sourceFiles)
  const sourceDirectories = Array.from(
    new Set(sourceFiles.map((sourceFile) => sourceFile.getDirectory()))
  )

  for (const sourceDirectory of sourceDirectories) {
    const directorySourceFile = getDirectorySourceFile(sourceDirectory)
    fileSystemSources.add(directorySourceFile || sourceDirectory)
  }

  return {
    fileSystemSources: Array.from(fileSystemSources),
    sourceFiles,
    sourceDirectories,
  }
}

/** Get the path of a source file or directory. */
function getSourcePath(source: SourceFile | Directory) {
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

/** Unwraps exported declarations from a source file. */
function getExportedDeclaration(
  exportedDeclarations: ReadonlyMap<string, ExportedDeclarations[]>,
  name: string
) {
  const exportDeclarations = exportedDeclarations.get(name)

  if (!exportDeclarations) {
    return undefined
  }

  if (exportDeclarations.length > 1) {
    const filePath = exportDeclarations[0]
      .getSourceFile()
      .getFilePath()
      .replace(process.cwd(), '')

    throw new Error(
      `[mdxts] Multiple declarations found for export in source file at ${filePath}.`
    )
  }

  return exportDeclarations[0]
}
