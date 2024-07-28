import * as React from 'react'
import type { MDXContent } from 'mdx/types'
import { Project, type SourceFile } from 'ts-morph'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import AliasesFromTSConfig from 'aliases-from-tsconfig'
import globParent from 'glob-parent'

import { filePathToPathname } from '../utils/file-path-to-pathname'
import { getGitMetadata } from './get-git-metadata'

export type { MDXContent }

export interface Collection<Exports extends Record<string, unknown>> {
  /** Retrieves a source in the collection by its slug. */
  getSource(slug: string): Source<Exports>

  /** Retrieves all sources in the collection. */
  getAllSources(): Source<Exports>[]
}

export interface CollectionOptions {
  baseDirectory?: string
  basePathname?: string
  tsConfigFilePath?: string
  sort?: (a: string, b: string) => number
}

export interface Export<Value> {
  /** The line and column where the export starts. */
  getStart(): { line: number; column: number }

  /** The line and column where the export ends. */
  getEnd(): { line: number; column: number }

  /** The executable value of the export. */
  getValue(): Promise<Value>
}

export interface NamedExport<Value> extends Export<Value> {
  /** The name of the export. */
  getName(): string
}

export interface Source<NamedExports extends Record<string, unknown>> {
  /** A human-readable version of the file name. */
  getLabel(): string

  /** The path to the file accounting for the `baseDirectory` and `basePathname` options. */
  getPathname(): string

  /** The date the file was first created. */
  getCreatedAt(): Promise<Date | undefined>

  /** The date the file was last updated. */
  getUpdatedAt(): Promise<Date | undefined>

  /** All authors who have contributed to the file. */
  getAuthors(): Promise<string[]>

  /** The previous and next files in the collection if they exist. */
  getSiblings(): Source<NamedExports>[]

  /** The execution environment of the file. */
  getExecutionEnvironment(): 'server' | 'client' | 'isomorphic'

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

/** Removes the leading slash and file extension from a file path. */
function trimLeadingSlashAndFileExtension(filePath: string) {
  return filePath.replace(/^\//, '').replace(/\.[^/.]+$/, '')
}

const PACKAGE_NAME = 'mdxts/core'
const PACKAGE_DIRECTORY = '.mdxts'

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
      `import { setImports } from '${PACKAGE_NAME}';`,
      `setImports([\n${importMapEntriesString}\n]);`,
      `export * from '${PACKAGE_NAME}';`,
    ].join('\n')
  )
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
  AllExports extends FilePattern extends MdFilePattern | MdxFilePattern
    ? { default: MDXContent; [key: string]: unknown }
    : { [key: string]: unknown },
  FilePattern extends AnyFilePattern = AnyFilePattern,
>(
  filePattern: FilePattern,
  options?: CollectionOptions
): Collection<AllExports> {
  const tsConfigFilePath = options?.tsConfigFilePath ?? 'tsconfig.json'
  const project = resolveProject(tsConfigFilePath)
  const aliases = new AliasesFromTSConfig(tsConfigFilePath)
  // TODO: this has a bug where it doesn't resolve the correct path if not relative e.g. ["*"] instead of ["./*"]
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

  const getSlug = (sourceFile: SourceFile) => {
    return trimLeadingSlashAndFileExtension(
      sourceFile.getFilePath().replace(absoluteBaseGlobPattern, '')
    )
  }
  const collection: Collection<AllExports> = {
    getSource(slug: string): Source<AllExports> {
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
      const getImport = importMaps.get(importKey) as (
        slug: string
      ) => Promise<AllExports>

      if (!getImport) {
        throw new Error(
          `No source found for slug "${slug}" at file pattern "${filePattern}". Make sure the ".mdxts" directory was successfully created and your tsconfig.json is aliased correctly.`
        )
      }

      const sourceFile = matchingSourceFiles[0]
      const sourceFilePath = sourceFile.getFilePath()
      const importSlug = getSlug(sourceFile)
      let moduleExports: AllExports | null = null

      async function ensureModuleExports() {
        if (moduleExports === null) {
          moduleExports = await getImport(importSlug)
        }
      }

      let gitMetadata: Awaited<ReturnType<typeof getGitMetadata>> | null = null

      async function ensureGetGitMetadata() {
        if (gitMetadata === null) {
          gitMetadata = await getGitMetadata(sourceFilePath)
        }
      }

      return {
        getLabel() {
          return ''
        },
        getPathname() {
          return filePathToPathname(
            sourceFilePath,
            options?.baseDirectory,
            options?.basePathname
          )
        },
        async getCreatedAt() {
          await ensureGetGitMetadata()
          return gitMetadata!.createdAt
        },
        async getUpdatedAt() {
          await ensureGetGitMetadata()
          return gitMetadata!.updatedAt
        },
        async getAuthors() {
          await ensureGetGitMetadata()
          return gitMetadata!.authors
        },
        getSiblings() {
          const currentIndex = sourceFiles.findIndex(
            (file) => file.getFilePath() === sourceFilePath
          )

          if (currentIndex === -1) {
            return [] as Source<AllExports>[]
          }

          const siblings: (Source<AllExports> | undefined)[] = []
          const previousFile = sourceFiles[currentIndex - 1]
          const nextFile = sourceFiles[currentIndex + 1]

          if (previousFile) {
            const previousSlug = getSlug(previousFile)
            siblings.push(collection.getSource(previousSlug))
          } else {
            siblings.push(undefined)
          }

          if (nextFile) {
            const nextSlug = getSlug(nextFile)
            siblings.push(collection.getSource(nextSlug))
          } else {
            siblings.push(undefined)
          }

          return siblings
        },
        getExecutionEnvironment() {
          const importDeclarations = sourceFile.getImportDeclarations()

          for (const importDeclaration of importDeclarations) {
            const moduleSpecifier = importDeclaration.getModuleSpecifierValue()
            if (moduleSpecifier === 'server-only') {
              return 'server'
            }
            if (moduleSpecifier === 'client-only') {
              return 'client'
            }
          }

          return 'isomorphic'
        },
        getDefaultExport() {
          return {
            async getValue() {
              await ensureModuleExports()
              const defaultExport = moduleExports!.default

              /* Enable hot module reloading in development for Next.js */
              if (
                process.env.NODE_ENV === 'development' &&
                process.env.MDXTS_NEXT_JS === 'true'
              ) {
                const Component = defaultExport as React.ComponentType

                return async (props: Record<string, unknown>) => {
                  const { Refresh } = await import('./Refresh')
                  return (
                    <>
                      <Refresh
                        port={process.env.MDXTS_WS_PORT!}
                        directory={absoluteBaseGlobPattern
                          .replace(process.cwd(), '')
                          .slice(1)}
                      />
                      <Component {...props} />
                    </>
                  )
                }
              }

              return defaultExport as AllExports['default']
            },
          }
        },
        getNamedExport<Name extends keyof Omit<AllExports, 'default'>>(
          name: Name
        ) {
          return {
            getName() {
              return name as Name
            },
            getStart() {
              return
            },
            async getValue() {
              await ensureModuleExports()
              const source = moduleExports![name]

              if (!source) {
                throw new Error(
                  `No named export found for name "${name.toString()}" at file pattern "${filePattern}"`
                )
              }

              return source as AllExports[Name]
            },
          }
        },
        getAllNamedExports() {
          return Object.entries(moduleExports!).map(([name, source]) => ({
            getName() {
              return name
            },
            async getValue() {
              await ensureModuleExports()
              return moduleExports![name]
            },
          }))
        },
      } as Source<AllExports>
    },

    getAllSources(): Source<AllExports>[] {
      return sourceFiles.map((sourceFile) => {
        const slug = getSlug(sourceFile)
        return this.getSource(slug)
      })
    },
  }

  return collection
}