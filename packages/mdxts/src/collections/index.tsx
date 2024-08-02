import * as React from 'react'
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

import { getGitMetadata } from './get-git-metadata'
import { getSourcePathMap } from './get-source-files-path-map'
import { getSourceFilesOrderMap } from './get-source-files-sort-order'
import { updateImportMap, getImportMap, setImports } from './import-maps'
import type {
  FilePatterns,
  CollectionOptions,
  CollectionSource,
  FileSystemSource,
  ExportSource,
  DefaultExportSource,
  NamedExportSource,
} from './types'
import { getDirectorySourceFile } from './get-directory-source-file'

export type {
  MDXContent,
  FileSystemSource,
  ExportSource,
  DefaultExportSource,
  NamedExportSource,
}

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
 * Creates a collection of sources based on a specified file pattern.
 * An import getter for each file extension will be generated at the root of the project in a `.mdxts/index.js` file.
 *
 * @param filePattern - A pattern to match files (e.g., "*.ts", "*.mdx").
 * @param options - Optional settings for the collection, including base directory, base path, TypeScript config file path, and a custom sort function.
 * @returns A collection object that provides methods to retrieve individual sources or all sources matching the pattern.
 * @throws An error if no sources are found for the given pattern.
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
  const { fileSystemSources, sourceFiles } = getSourceFilesAndDirectories(
    project,
    absoluteGlobPattern
  )

  if (fileSystemSources.length === 0) {
    throw new Error(
      `[mdxts] No source files or directories were found for the file pattern: ${filePattern}`
    )
  }

  /** Update the import map for the file pattern if it was not added when initializing the cli. */
  updateImportMap(filePattern, sourceFiles)

  const baseDirectory = project.getDirectoryOrThrow(absoluteBaseGlobPattern)
  const sourceFilesOrderMap = getSourceFilesOrderMap(baseDirectory)
  const sourcePathMap = getSourcePathMap(baseDirectory, {
    baseDirectory: options?.baseDirectory,
    basePath: options?.basePath,
  })
  const getImportSlug = (source: SourceFile | Directory) => {
    return (
      getSourcePath(source)
        // remove the base glob pattern: /src/posts/welcome.mdx -> /posts/welcome.mdx
        .replace(absoluteBaseGlobPattern, '')
        // remove leading slash: /posts/welcome.mdx -> posts/welcome.mdx
        .replace(/^\//, '')
        // remove file extension: Button.tsx -> Button
        .replace(/\.[^/.]+$/, '')
    )
  }
  const collection = {
    getTitle() {
      if (!options?.title) {
        throw new Error(
          `[mdxts] No title provided for collection with file pattern "${filePattern}".`
        )
      }

      return parseTitle(options.title)
    },
    getPath() {
      if (options?.basePath) {
        return options.basePath.startsWith('/')
          ? options.basePath
          : `/${options.basePath}`
      }
      return '/'
    },
    getEditPath() {
      return absoluteBaseGlobPattern.replace(process.cwd(), '')
    },
    getSource(
      path: string | string[]
    ): FileSystemSource<AllExports> | undefined {
      let pathString = Array.isArray(path) ? path.join('/') : path

      // ensure the path starts with a slash
      if (!pathString.startsWith('/')) {
        pathString = `/${pathString}`
      }

      // prepend the collection base path if it exists and the path does not already start with it
      if (options?.basePath) {
        if (!pathString.startsWith(`/${options.basePath}`)) {
          pathString = `/${options.basePath}${pathString}`
        }
      }

      const matchingSources = fileSystemSources.filter((sourceFile) => {
        const path = sourcePathMap.get(getSourcePath(sourceFile))!
        return path === pathString
      })

      const slugExtensions = new Set(
        matchingSources
          .map((source) =>
            source instanceof SourceFile ? source.getExtension() : undefined
          )
          .filter(Boolean)
      )

      if (matchingSources.length === 0 && slugExtensions.size === 0) {
        return
      } else if (slugExtensions.size > 1) {
        throw new Error(
          `[mdxts] Multiple sources found for file pattern "${filePattern}" at path "${pathString}". Only one source is currently allowed. Please file an issue for support.`
        )
      }

      const sourceFileOrDirectory = matchingSources.at(0)!
      const sourcePath = getSourcePath(sourceFileOrDirectory)
      const isSourceFile = sourceFileOrDirectory instanceof SourceFile
      const isDirectory = sourceFileOrDirectory instanceof Directory
      const exportedDeclarations = isSourceFile
        ? sourceFileOrDirectory.getExportedDeclarations()
        : new Map()
      const slugExtension = Array.from(slugExtensions).at(0)?.slice(1)
      const importKey = `${slugExtension}:${filePattern}`
      const getImport = getImportMap<AllExports>(importKey)

      if (isSourceFile && !getImport) {
        throw new Error(
          `[mdxts] No source found for slug "${pathString}" at file pattern "${filePattern}":
You can fix this error by taking the following actions:

- Make sure the ".mdxts" directory was successfully created and your tsconfig.json is aliases "mdxts" to ".mdxts/index.js" correctly.
- Make sure the file pattern is formatted correctly and targeting files that exist.
- Try refreshing the page or restarting server.
- If you continue to see this error, please file an issue: https://github.com/souporserious/mdxts/issues`
        )
      }

      let moduleExports: AllExports | null = null

      async function ensureModuleExports() {
        if (isSourceFile && moduleExports === null) {
          const importSlug = getImportSlug(sourceFileOrDirectory)
          moduleExports = await getImport(importSlug)
        }
      }

      let gitMetadata: Awaited<ReturnType<typeof getGitMetadata>> | null = null

      async function ensureGetGitMetadata() {
        if (gitMetadata === null) {
          gitMetadata = await getGitMetadata(sourcePath)
        }
      }

      const source = {
        getName() {
          const baseName = isDirectory
            ? sourceFileOrDirectory.getBaseName()
            : sourceFileOrDirectory.getBaseNameWithoutExtension()

          return (
            baseName
              // remove leading numbers e.g. 01.intro -> intro
              .replace(/^\d+\./, '')
          )
        },
        getTitle() {
          return (
            parseTitle(this.getName())
              // remove hyphens e.g. my-component -> my component
              .replace(/-/g, ' ')
          )
        },
        getPath() {
          return pathString
        },
        getEditPath() {
          return sourcePath
        },
        getDepth() {
          return getPathDepth(pathString)
        },
        getOrder() {
          const order = sourceFilesOrderMap.get(sourcePath)

          if (order === undefined) {
            throw new Error(
              `[mdxts] Source file order not found for file path "${sourcePath}". If you see this error, please file an issue.`
            )
          }

          return order
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
        getSource(path: string | string[]) {
          const currentPath = this.getPath()
          const fullPath = Array.isArray(path)
            ? `${currentPath}/${path.join('/')}`
            : `${currentPath}/${path}`

          return collection.getSource(fullPath)
        },
        getSources() {
          const path = this.getPath()
          const depth = this.getDepth()

          return fileSystemSources
            .map((source) => {
              const path = sourcePathMap.get(getSourcePath(source))!
              return collection.getSource(path)
            })
            .filter((source) => {
              if (source) {
                const descendantPath = source.getPath()
                const descendantDepth = source.getDepth()
                return (
                  descendantPath.startsWith(path) &&
                  descendantDepth === depth + 1
                )
              }
            }) as FileSystemSource<AllExports>[]
        },
        getSiblings() {
          const currentIndex = fileSystemSources.findIndex(
            (source) => getSourcePath(source) === sourcePath
          )

          if (currentIndex === -1) {
            return []
          }

          const siblings: [
            FileSystemSource<AllExports> | undefined,
            FileSystemSource<AllExports> | undefined,
          ] = [undefined, undefined]
          const previousSource = fileSystemSources[currentIndex - 1]
          const nextSource = fileSystemSources[currentIndex + 1]

          if (previousSource) {
            const previousSlug = sourcePathMap.get(
              getSourcePath(previousSource)
            )!
            siblings[0] = collection.getSource(previousSlug)
          }

          if (nextSource) {
            const nextSlug = sourcePathMap.get(getSourcePath(nextSource))!
            siblings[1] = collection.getSource(nextSlug)
          }

          return siblings
        },
        getDefaultExport() {
          if (isDirectory) {
            const baseName = sourceFileOrDirectory.getBaseName()
            throw new Error(
              `[mdxts] Directory "${baseName}" at path "${source.getPath()}" does not have a default export.

You can fix this error by taking one of the following actions:

- Catch and handle this error in your code.
- Add an index or readme file to the ${baseName} directory.
  . Ensure the file has a valid extension based this collection's file pattern (${filePattern}).
  . Define a default export in the file.`
            )
          }

          const defaultDeclaration = exportedDeclarations.get('default')

          return {
            getName(): string {
              if (defaultDeclaration) {
                const declarationName = getDeclarationName(defaultDeclaration)

                if (declarationName) {
                  return declarationName
                }
              }
              return source.getName() as string
            },
            getTitle() {
              const name = this.getName()
              if (name) {
                return parseTitle(name)
              }
            },
            getText() {
              if (!defaultDeclaration) {
                throw new Error(
                  `[mdxts] Default export could not be statically analyzed from source file at "${sourcePath}".`
                )
              }
              return defaultDeclaration.getText()
            },
            getEnvironment() {
              for (const importDeclaration of sourceFileOrDirectory.getImportDeclarations()) {
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
              const name = this.getName()
              const path = this.getPath()
              if (name) {
                return `${path}/${name}`
              }
              return path
            },
            getEditPath() {
              return defaultDeclaration.getSourceFile().getFilePath()
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

              if (defaultExport === undefined) {
                return
              }

              /* Enable hot module reloading in development for Next.js */
              if (
                process.env.NODE_ENV === 'development' &&
                process.env.MDXTS_NEXT_JS === 'true'
              ) {
                // TODO: not every default export is a React component, this should be enabled in the root layout
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
          if (isDirectory) {
            const baseName = sourceFileOrDirectory.getBaseName()
            throw new Error(
              `[mdxts] Directory "${baseName}" at path "${source.getPath()}" does not have a named export for "${name.toString()}".

You can fix this error by taking one of the following actions:

- Catch and handle this error in your code.
- Add an index or readme file to the directory.
  . Ensure the file has a valid extension based this collection's file pattern (${filePattern}).
  . Define a named export of "${name.toString()}" in the file.`
            )
          }

          const exportDeclaration = exportedDeclarations.get(name as string) as
            | ExportedDeclarations
            | undefined

          return {
            getName() {
              return name as string
            },
            getTitle() {
              return parseTitle(name as string)
            },
            getText() {
              if (!exportDeclaration) {
                throw new Error(
                  `[mdxts] Named export "${name.toString()}" could not be statically analyzed from source file at "${sourcePath}".`
                )
              }

              return exportDeclaration.getText()
            },
            getEnvironment() {
              for (const importDeclaration of sourceFileOrDirectory.getImportDeclarations()) {
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
              return `${this.getPath()}/${name as string}`
            },
            getEditPath() {
              if (exportDeclaration) {
                return exportDeclaration.getSourceFile().getFilePath()
              }
              return sourceFileOrDirectory.getFilePath()
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
          let sourceFile: SourceFile

          if (sourceFileOrDirectory instanceof Directory) {
            const directorySourceFile = getDirectorySourceFile(
              sourceFileOrDirectory
            )!
            if (directorySourceFile) {
              sourceFile = getDirectorySourceFile(sourceFileOrDirectory)!
            } else {
              throw new Error(
                `[mdxts] No source file found for directory while attempting to load named exports at "${sourceFileOrDirectory.getBaseName()}".`
              )
            }
          } else {
            sourceFile = sourceFileOrDirectory
          }

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
      const depthOffset = options?.basePath
        ? getPathDepth(options.basePath) + 1
        : 1

      return fileSystemSources
        .map((source) => {
          const path = sourcePathMap.get(getSourcePath(source))!
          return this.getSource(path)
        })
        .filter(
          (source) => source?.getDepth() === depthOffset
        ) as FileSystemSource<AllExports>[]
    },
  } satisfies CollectionSource<AllExports>

  return collection
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
