import type { MDXContent } from 'mdx/types'
import { Project, type SourceFile } from 'ts-morph'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import AliasesFromTSConfig from 'aliases-from-tsconfig'
import globParent from 'glob-parent'

export type { MDXContent }

export interface Collection<Exports extends Record<string, unknown>> {
  /** Retrieves a file by its slug. */
  getSource(slug: string): Promise<File<Exports>>

  /** Retrieves all files in the collection. */
  getAllFiles(): Promise<File<Exports>[]>
}

export interface CollectionOptions {
  baseDirectory?: string
  basePathname?: string
  tsConfigFilePath?: string
  sort?: (a: string, b: string) => number
}

export interface Export<Source> {
  /** The line and column where the export starts. */
  getStart(): { line: number; column: number }

  /** The line and column where the export ends. */
  getEnd(): { line: number; column: number }

  /** The executable source of the export. */
  getValue(): Source
}

export interface NamedExport<Source> extends Export<Source> {
  /** The name of the export. */
  getName(): string
}

export interface File<NamedExports extends Record<string, unknown>> {
  /** A human-readable version of the file name. */
  getLabel(): string

  /** The relative path to the file accounting for collection options. */
  getPath(): string

  /** The previous and next files in the collection if they exist. */
  getSiblings(): File<NamedExports>[]

  /** The executable source of the default export. */
  getDefaultExport(): Export<NamedExports['default']>

  /** A named export of the file. */
  getNamedExport<Name extends keyof NamedExports>(
    name: Name
  ): NamedExport<NamedExports[Name]>

  /** All named exports of the file. */
  getAllNamedExports(): NamedExport<NamedExports[keyof NamedExports]>[]
}

export type JsFilePattern = `${string}js${string}` | `${string}js`

export type JsxFilePattern = `${string}jsx${string}` | `${string}jsx`

export type TsFilePattern = `${string}ts${string}` | `${string}ts`

export type TsxFilePattern = `${string}tsx${string}` | `${string}tsx`

export type MdFilePattern = `${string}md${string}` | `${string}md`

export type MdxFilePattern = `${string}mdx${string}` | `${string}mdx`

export type AnyFilePattern =
  | JsFilePattern
  | JsxFilePattern
  | TsFilePattern
  | TsxFilePattern
  | MdFilePattern
  | MdxFilePattern

let importMaps = new Map<string, (slug: string) => Promise<unknown>>()

/**
 * Sets the import maps for a collection's file patterns.
 *
 * @internal
 * @param importMapEntries - An array of tuples where the first element is a file pattern and the second element is a function that returns a promise resolving to the import.
 */
export function setImports(
  importMapEntries: [AnyFilePattern, (slug: string) => Promise<unknown>][]
) {
  importMaps = new Map(importMapEntries)
}

/** Removes the file extension from a file path. */
function trimFileExtension(filePath: string) {
  return filePath.replace(/\.[^/.]+$/, '')
}

const PACKAGE_NAME = 'mdxts'
const PACKAGE_DIRECTORY = `.${PACKAGE_NAME}`

/** Updates the import map for a file pattern and its source files. */
function updateImportMap(filePattern: string, sourceFiles: SourceFile[]) {
  const baseGlobPattern = globParent(filePattern)
  const allExtensions = Array.from(
    new Set(sourceFiles.map((sourceFile) => sourceFile.getExtension()))
  )
  const nextImportMapEntries = allExtensions.map((extension) => {
    const trimmedExtension = extension.slice(1)
    return `['${trimmedExtension}:${filePattern}', (slug) => import(\`${baseGlobPattern}/\${slug}${extension}\`)]`
  })
  let previousImportMapEntries: string[] = []

  if (existsSync(`${PACKAGE_DIRECTORY}/index.js`)) {
    const previousImportMapLines = readFileSync(
      `${PACKAGE_DIRECTORY}/index.js`,
      'utf-8'
    )
      .split('\n')
      .filter(Boolean)
    const importMapStartIndex = previousImportMapLines.findIndex((line) =>
      line.includes('setImports([')
    )
    const importMapEndIndex = previousImportMapLines.findIndex((line) =>
      line.includes(']);')
    )
    previousImportMapEntries = previousImportMapLines
      .slice(importMapStartIndex + 1, importMapEndIndex)
      .map(
        // trim space and reomve trailing comma if present
        (line) => line.trim().replace(/,$/, '')
      )
  }

  const mergedImportMapEntries = Array.from(
    new Set(
      previousImportMapEntries.concat(nextImportMapEntries).filter(Boolean)
    )
  )
  const importMapEntriesString = mergedImportMapEntries
    .map((entry) => `  ${entry}`)
    .join(',\n')

  if (!existsSync(PACKAGE_DIRECTORY)) {
    mkdirSync(PACKAGE_DIRECTORY)
  }

  writeFileSync(
    `${PACKAGE_DIRECTORY}/index.js`,
    [
      `import { setImports } from 'node_modules/${PACKAGE_NAME}';`,
      `setImports([\n${importMapEntriesString}\n]);`,
      `export * from 'node_modules/${PACKAGE_NAME}';`,
    ].join('\n')
  )
}

/**
 * Creates a collection of files based on a specified file pattern.
 *
 * @param filePattern - A pattern to match files (e.g., "*.ts", "*.mdx").
 * @param options - Optional settings for the collection, including base directory, base pathname, TypeScript config file path, and a custom sort function.
 * @returns A collection object that provides methods to retrieve individual files or all files matching the pattern.
 *
 * The collection object includes:
 * - `getFile(slug: string)`: Retrieves a file by its slug.
 * - `getAllFiles()`: Retrieves all files in the collection.
 *
 * The function also sets up import maps for each file pattern at the root of the project and writes them to a `.mdxts/index.js` file.
 *
 * @throws An error if no source files are found for the given pattern.
 */
export function createCollection<
  NamedExports extends FilePattern extends MdFilePattern | MdxFilePattern
    ? { default: MDXContent; [key: string]: unknown }
    : { [key: string]: unknown },
  FilePattern extends AnyFilePattern = AnyFilePattern,
>(
  filePattern: FilePattern,
  options?: CollectionOptions
): Collection<NamedExports> {
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    tsConfigFilePath: options?.tsConfigFilePath ?? 'tsconfig.json',
  })
  const tsConfigFilePath = project.getCompilerOptions().configFilePath as string
  const aliases = new AliasesFromTSConfig(tsConfigFilePath)
  const absoluteGlobPattern = aliases.apply(filePattern)
  const absoluteBaseGlobPattern = globParent(absoluteGlobPattern)
  let sourceFiles = project.getSourceFiles(absoluteGlobPattern)

  if (sourceFiles.length === 0) {
    sourceFiles = project.addSourceFilesAtPaths(absoluteGlobPattern)
  }

  if (sourceFiles.length === 0) {
    throw new Error(`No source files found for pattern: ${filePattern}`)
  }

  /** Update the import map for the file pattern if it was not added when initializing the cli. */
  updateImportMap(filePattern, sourceFiles)

  return {
    async getSource(slug: string): Promise<File<NamedExports>> {
      const matchingSourceFiles = sourceFiles.filter((sourceFile) => {
        let sourceFileSlug = sourceFile
          .getFilePath()
          // remove base glob pattern and leading slash
          .replace(`${absoluteBaseGlobPattern}/`, '')
          // remove extension
          .replace(/\.[^.]+$/, '')
          // normalize casing
          .toLowerCase()

        const index = '/index'
        if (sourceFileSlug.endsWith(index)) {
          sourceFileSlug = sourceFileSlug.slice(0, -index.length)
        }

        return sourceFileSlug === slug
      })
      const slugExtensions = new Set(
        matchingSourceFiles.map((sourceFile) => sourceFile.getExtension())
      )

      if (slugExtensions.size > 1) {
        throw new Error(
          `Multiple sources found for slug "${slug}" at file pattern "${filePattern}". Only one source is currently allowed. Please file an issue for support.`
        )
      }

      const slugExtension = Array.from(slugExtensions).at(0)?.slice(1)
      const importKey = `${slugExtension}:${filePattern}`
      // console.log({ importMaps, importKey })
      const getImport = importMaps.get(importKey) as (
        slug: string
      ) => Promise<{ default: unknown } & NamedExports>

      if (!getImport) {
        throw new Error(
          `No source found for slug "${slug}" at file pattern "${filePattern}"`
        )
      }

      const sourceFile = matchingSourceFiles[0]
      const importPath = trimFileExtension(
        sourceFile.getFilePath().replace(absoluteBaseGlobPattern, '')
      ).slice(1)
      const { default: defaultExport, ...restExports } =
        await getImport(importPath)
      const namedExports = restExports as NamedExports

      return {
        getLabel() {
          return ''
        },
        getPath() {
          return ''
        },
        getSiblings() {
          return [] as File<NamedExports>[]
        },
        getDefaultExport() {
          if (!defaultExport) {
            throw new Error(
              `No default export found for slug "${slug}" at file pattern "${filePattern}"`
            )
          }

          return {
            getValue() {
              return defaultExport as NamedExports['default']
            },
          }
        },
        getNamedExport<Name extends keyof NamedExports>(name: Name) {
          return {
            getName() {
              return name as Name
            },
            getStart() {
              return
            },
            getValue() {
              const source = namedExports[name]

              if (!source) {
                throw new Error(
                  `No named export found for name "${name.toString()}" at file pattern "${filePattern}"`
                )
              }

              return source as NamedExports[Name]
            },
          }
        },
        getAllNamedExports() {
          return Object.entries(namedExports).map(([name, source]) => ({
            getName() {
              return name
            },
            getValue() {
              return source
            },
          }))
        },
      } as File<NamedExports>
    },

    async getAllFiles(): Promise<File<NamedExports>[]> {
      return [] as File<NamedExports>[]
    },
  }
}
