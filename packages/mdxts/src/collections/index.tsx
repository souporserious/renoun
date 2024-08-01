import * as React from 'react'
import type { MDXContent } from 'mdx/types'
import { Project, type SourceFile } from 'ts-morph'
import AliasesFromTSConfig from 'aliases-from-tsconfig'
import globParent from 'glob-parent'

import { getSourceFilesOrderMap } from '../utils/get-source-files-sort-order'
import { getGitMetadata } from './get-git-metadata'
import { getSourceFilesPathnameMap } from './get-source-files-pathname-map'
import { updateImportMap, getImportMap, setImports } from './import-maps'
import type {
  FilePatterns,
  CollectionOptions,
  CollectionSource,
  FileSystemSource,
  ExportSource,
} from './types'

export type { MDXContent, FileSystemSource, ExportSource }

export { setImports }

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
  AllExports extends FilePattern extends FilePatterns<'md' | 'mdx'>
    ? { default: MDXContent; [key: string]: unknown }
    : { [key: string]: unknown },
  FilePattern extends FilePatterns = string,
>(
  filePattern: FilePattern,
  options?: CollectionOptions
): CollectionSource<AllExports> {
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

  const baseDirectory = project.getDirectoryOrThrow(absoluteBaseGlobPattern)
  const sourceFilesOrderMap = getSourceFilesOrderMap(baseDirectory)
  const sourceFilesPathnameMap = getSourceFilesPathnameMap(baseDirectory, {
    baseDirectory: options?.baseDirectory,
    basePathname: options?.basePathname,
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
  const collection = {
    getName() {
      return ''
    },
    getPath() {
      return ''
    },
    getEditPath() {
      return ''
    },
    getSource(
      pathname: string | string[]
    ): FileSystemSource<AllExports> | undefined {
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
      const getImport = getImportMap<AllExports>(importKey)

      if (!getImport) {
        throw new Error(
          `[mdxts] No source found for slug "${pathnameString}" at file pattern "${filePattern}":\n   - Make sure the ".mdxts" directory was successfully created and your tsconfig.json is aliased correctly.\n   - Make sure the file pattern is formatted correctly and targeting files that exist.`
        )
      }

      const sourceFile = matchingSourceFiles[0]
      const sourceFilePath = sourceFile.getFilePath()
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
        getName() {
          return sourceFile.getBaseName()
        },
        getPath() {
          return pathnameString
        },
        getEditPath() {
          return sourceFilePath
        },
        getDepth() {
          const segments = pathnameString.split('/').filter(Boolean)

          if (segments.at(0) === options?.basePathname) {
            return segments.length - 2
          }

          return segments.length - 1
        },
        getOrder() {
          return sourceFilesOrderMap[sourceFilePath]
        },
        async getCreatedAt() {
          await ensureGetGitMetadata()
          return gitMetadata!.createdAt
            ? new Date(gitMetadata!.createdAt)
            : undefined
        },
        async getUpdatedAt() {
          await ensureGetGitMetadata()
          return gitMetadata!.updatedAt
            ? new Date(gitMetadata!.updatedAt)
            : undefined
        },
        async getAuthors() {
          await ensureGetGitMetadata()
          return gitMetadata!.authors
        },
        getSource(pathname: string | string[]) {
          const currentPath = this.getPath()
          const fullPath = Array.isArray(pathname)
            ? `${currentPath}/${pathname.join('/')}`
            : `${currentPath}/${pathname}`
          return collection.getSource(fullPath)
        },
        getSources() {
          const depth = this.getDepth()
          return collection
            .getSources()
            .filter((source) => source.getDepth() === depth)
        },
        getSiblings() {
          const currentIndex = sourceFiles.findIndex(
            (file) => file.getFilePath() === sourceFilePath
          )

          if (currentIndex === -1) {
            return []
          }

          const siblings: [
            FileSystemSource<AllExports> | undefined,
            FileSystemSource<AllExports> | undefined,
          ] = [undefined, undefined]
          const previousFile = sourceFiles[currentIndex - 1]
          const nextFile = sourceFiles[currentIndex + 1]

          if (previousFile) {
            const previousSlug = sourceFilesPathnameMap.get(
              previousFile.getFilePath()
            )!
            siblings[0] = collection.getSource(previousSlug)
          }

          if (nextFile) {
            const nextSlug = sourceFilesPathnameMap.get(nextFile.getFilePath())!
            siblings[1] = collection.getSource(nextSlug)
          }

          return siblings
        },
        getDefaultExport() {
          return {
            getName() {
              return 'TODO'
            },
            getType() {
              return 'TODO'
            },
            getText() {
              return 'TODO'
            },
            getEnvironment() {
              const importDeclarations = sourceFile.getImportDeclarations()

              for (const importDeclaration of importDeclarations) {
                const specifier = importDeclaration.getModuleSpecifierValue()
                if (specifier === 'server-only') {
                  return 'server'
                }
                if (specifier === 'client-only') {
                  return 'client'
                }
              }

              return 'isomorphic'
            },
            getPath() {
              return 'TODO'
            },
            getEditPath() {
              return 'TODO'
            },
            getPosition() {
              return {
                startLine: 0,
                startColumn: 0,
                endLine: 0,
                endColumn: 0,
              }
            },
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
              return name as string
            },
            getType() {
              return 'TODO'
            },
            getText() {
              return 'TODO'
            },
            getEnvironment() {
              const importDeclarations = sourceFile.getImportDeclarations()

              for (const importDeclaration of importDeclarations) {
                const specifier = importDeclaration.getModuleSpecifierValue()
                if (specifier === 'server-only') {
                  return 'server'
                }
                if (specifier === 'client-only') {
                  return 'client'
                }
              }

              return 'isomorphic'
            },
            getPath() {
              return 'TODO'
            },
            getEditPath() {
              return 'TODO'
            },
            getPosition() {
              return {
                startLine: 0,
                startColumn: 0,
                endLine: 0,
                endColumn: 0,
              }
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
            return this.getNamedExport(
              name as Exclude<keyof AllExports, 'default'>
            )
          })
        },
      } satisfies FileSystemSource<AllExports>

      return source
    },

    getSources() {
      const baseDepth = options?.basePathname
        ? options.basePathname.split('/').filter(Boolean).length
        : 0

      return sourceFiles
        .filter((sourceFile) => {
          const slug = sourceFilesPathnameMap.get(sourceFile.getFilePath())!
          const depth = slug.split('/').filter(Boolean).length
          return depth === baseDepth + 1
        })
        .map((sourceFile) => {
          const slug = sourceFilesPathnameMap.get(sourceFile.getFilePath())!
          return this.getSource(slug)
        })
        .filter(Boolean) as FileSystemSource<AllExports>[]
    },
  } satisfies CollectionSource<AllExports>

  return collection
}
