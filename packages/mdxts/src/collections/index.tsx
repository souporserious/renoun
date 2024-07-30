import * as React from 'react'
import type { MDXContent } from 'mdx/types'
import { Project, type SourceFile } from 'ts-morph'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
// import { dirname, join } from 'node:path'
import AliasesFromTSConfig from 'aliases-from-tsconfig'
import globParent from 'glob-parent'

import { getSourceFilesOrderMap } from '../utils/get-source-files-sort-order'
import { getGitMetadata } from './get-git-metadata'
import { getSourceFilesPathnameMap } from './get-source-files-pathname-map'
// import { getPackageMetadata } from './get-package-metadata'
// import { getPublicPaths } from './get-public-paths'

export type { MDXContent }

export interface Collection<AllExports extends Record<string, unknown>> {
  /** Retrieves a source in the collection by its slug. */
  getSource(slug: string | string[]): Source<AllExports> | undefined

  /** Retrieves all sources in the collection. */
  getSources(): Source<AllExports>[]
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

export interface Source<AllExports extends Record<string, unknown>> {
  /** A human-readable version of the file name. */
  getLabel(): string

  /** The path to the file accounting for the `baseDirectory` and `basePathname` options. */
  getPathname(): string

  /** The order of the file in the collection based on the position in the file system. */
  getOrder(): string

  /** The depth of the file in the directory structure. */
  getDepth(): number

  /** The date the file was first created. */
  getCreatedAt(): Promise<Date | undefined>

  /** The date the file was last updated. */
  getUpdatedAt(): Promise<Date | undefined>

  /** All authors who have contributed to the file. */
  getAuthors(): Promise<string[]>

  /** The previous and next files in the collection if they exist. */
  getSiblings(): Source<AllExports>[]

  /** The execution environment of the file. */
  getExecutionEnvironment(): 'server' | 'client' | 'isomorphic'

  /** The executable source of the default export. */
  getDefaultExport(): Export<AllExports['default']>

  /** A named export of the file. */
  getNamedExport<Name extends Exclude<keyof AllExports, 'default'>>(
    name: Name
  ): NamedExport<AllExports[Name]>

  /** All named exports of the file. */
  getNamedExports(): NamedExport<AllExports[keyof AllExports]>[]
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
 * An import getter for each file extension will be generated at the root of the project in a `.mdxts/index.js` file.
 *
 * @param filePattern - A pattern to match files (e.g., "*.ts", "*.mdx").
 * @param options - Optional settings for the collection, including base directory, base pathname, TypeScript config file path, and a custom sort function.
 * @returns A collection object that provides methods to retrieve individual files or all files matching the pattern.
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
  const project = resolveProject(options?.tsConfigFilePath ?? 'tsconfig.json')
  const tsConfigFilePath = project.getCompilerOptions().configFilePath as string
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

  // const packageMetadata = getPackageMetadata(dirname(tsConfigFilePath))

  // if (!packageMetadata) {
  //   throw new Error(
  //     `No package.json found for TypeScript config file path at: ${tsConfigFilePath}`
  //   )
  // }

  // const publicPaths = packageMetadata.exports
  //   ? getPublicPaths(packageMetadata)
  //   : sourceFiles.map((sourceFile) => sourceFile.getFilePath())
  const baseDirectory = project.getDirectoryOrThrow(absoluteBaseGlobPattern)
  const sourceFilesOrderMap = getSourceFilesOrderMap(baseDirectory)
  const sourceFilesPathnameMap = getSourceFilesPathnameMap(baseDirectory, {
    baseDirectory: options?.baseDirectory,
    basePathname: options?.basePathname,
    // packageName: packageMetadata?.name,
  })
  const getImportSlug = (sourceFile: SourceFile) => {
    return (
      sourceFile
        .getFilePath()
        // remove the base glob pattern: /src/posts/welcome.mdx -> /posts/welcome.mdx
        .replace(absoluteBaseGlobPattern, '')
        // remove leading slash: /posts/welcome.mdx -> posts/welcome.mdx
        .replace(/^\//, '')
        // remove file extension: Button.tsx -> Button
        .replace(/\.[^/.]+$/, '')
    )
  }
  const collection: Collection<AllExports> = {
    getSource(pathname: string | string[]): Source<AllExports> | undefined {
      let pathnameString = Array.isArray(pathname)
        ? pathname.join('/')
        : pathname

      if (!pathnameString.startsWith('/')) {
        pathnameString = `/${pathnameString}`
      }

      const matchingSourceFiles = sourceFiles.filter((sourceFile) => {
        const sourceFilePathname = sourceFilesPathnameMap.get(
          sourceFile.getFilePath()
        )!
        return sourceFilePathname === pathnameString
      })
      const slugExtensions = new Set(
        matchingSourceFiles.map((sourceFile) => sourceFile.getExtension())
      )

      if (slugExtensions.size === 0) {
        return undefined
      } else if (slugExtensions.size > 1) {
        throw new Error(
          `[mdxts] Multiple sources found for slug "${pathnameString}" at file pattern "${filePattern}". Only one source is currently allowed. Please file an issue for support.`
        )
      }

      const slugExtension = Array.from(slugExtensions).at(0)?.slice(1)
      const importKey = `${slugExtension}:${filePattern}`
      const getImport = importMaps.get(importKey) as (
        slug: string
      ) => Promise<AllExports>

      if (!getImport) {
        throw new Error(
          `[mdxts] No source found for slug "${pathnameString}" at file pattern "${filePattern}":\n   - Make sure the ".mdxts" directory was successfully created and your tsconfig.json is aliased correctly.\n   - Make sure the file pattern is formatted correctly and targeting files that exist.`
        )
      }

      const sourceFile = matchingSourceFiles[0]
      const sourceFilePath = sourceFile.getFilePath()
      // const isMainExport = options?.basePathname
      //   ? pathname === join(options.basePathname, packageMetadata.name)
      //   : pathname === packageMetadata.name

      let moduleExports: AllExports | null = null

      async function ensureModuleExports() {
        if (moduleExports === null) {
          const importSlug = getImportSlug(sourceFile)
          moduleExports = await getImport(importSlug)
        }
      }

      let gitMetadata: Awaited<ReturnType<typeof getGitMetadata>> | null = null

      async function ensureGetGitMetadata() {
        if (gitMetadata === null) {
          gitMetadata = await getGitMetadata(sourceFilePath)
        }
      }

      const source = {
        getLabel() {
          return ''
        },
        getPathname() {
          return pathnameString
        },
        getDepth() {
          return pathnameString.split('/').filter(Boolean).length
        },
        getOrder() {
          return sourceFilesOrderMap[sourceFilePath]
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
            const previousSlug = sourceFilesPathnameMap.get(
              previousFile.getFilePath()
            )!
            siblings.push(collection.getSource(previousSlug))
          } else {
            siblings.push(undefined)
          }

          if (nextFile) {
            const nextSlug = sourceFilesPathnameMap.get(nextFile.getFilePath())!
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
        getNamedExport<Name extends Exclude<keyof AllExports, 'default'>>(
          name: Name
        ) {
          return {
            getName() {
              return name as Name
            },
            getStart() {
              return
            },
            async getValue(): Promise<AllExports[Name]> {
              await ensureModuleExports()
              return moduleExports![name]
            },
          }
        },
        getNamedExports() {
          return sourceFile.getExportSymbols().map((symbol) => {
            const name = symbol.getName()

            return {
              getName() {
                return name
              },
              async getValue() {
                await ensureModuleExports()
                return moduleExports![name]
              },
            }
          })
        },
      } as Source<AllExports>

      return source
    },

    getSources() {
      return sourceFiles
        .map((sourceFile) => {
          const slug = sourceFilesPathnameMap.get(sourceFile.getFilePath())!
          return this.getSource(slug)
        })
        .filter(Boolean) as Source<AllExports>[]
    },
  }

  return collection
}
