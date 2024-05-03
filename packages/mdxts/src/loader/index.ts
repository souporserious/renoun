import * as webpack from 'webpack'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { glob } from 'fast-glob'
import globParent from 'glob-parent'
import { Node, Project, SyntaxKind } from 'ts-morph'
import { addComputedTypes, resolveObject } from '@tsxmod/utils'

import { project } from '../components/project'
import { getEntrySourceFiles } from '../utils/get-entry-source-files'
import { getExportedSourceFiles } from '../utils/get-exported-source-files'
import { addCodeMetaProps } from './add-code-meta-props'

/**
 * A Webpack loader that exports front matter data for MDX files and augments `createSource` call sites to add an additional
 * argument of all dynamic imports based on the provided file pattern.
 *
 * When a TypeScript file pattern is provided, the closest `README.mdx` or MDX file with the same name
 * will be used (e.g. `Button.tsx` and `Button.mdx`).
 */
export default async function loader(
  this: webpack.LoaderContext<{
    gitSource?: string
    gitBranch?: string
  }>,
  source: string | Buffer
) {
  const { gitSource, gitBranch } = this.getOptions()
  const callback = this.async()
  const sourceString = source.toString()
  const workingDirectory = dirname(this.resourcePath)

  /** Augment CodeBlock and ExportedTypes components to add the working directory and source path. */
  const isMDXTSComponentImported =
    /import\s+{\s*([^}]*\b(CodeBlock|ExportedTypes)\b[^}]*)\s*}/g.test(
      sourceString
    )

  if (isMDXTSComponentImported) {
    source = addCodeMetaProps(
      sourceString,
      this.resourcePath,
      workingDirectory,
      gitSource,
      gitBranch
    )
  }

  /** Augment `createSource` calls with MDX/TypeScript file paths. */
  const isCreateSourceImported =
    /.*import\s\{[^}]*createSource[^}]*\}\sfrom\s['"]mdxts['"].*/.test(
      sourceString
    )

  /** Only cache the loader if `createSource` is not imported. */
  this.cacheable(!isCreateSourceImported)

  if (isCreateSourceImported) {
    const sourceFile = new Project({
      useInMemoryFileSystem: true,
    }).createSourceFile('index.ts', sourceString)
    const createSourceCalls = sourceFile
      .getDescendantsOfKind(SyntaxKind.CallExpression)
      .filter((call) => call.getExpression().getText() === 'createSource')

    // Add computed types to the source file to calculate flattened front matter types
    if (createSourceCalls.length > 0) {
      addComputedTypes(sourceFile)
    }

    for (const createSourceCall of createSourceCalls) {
      try {
        const [firstArgument] = createSourceCall.getArguments()

        if (Node.isStringLiteral(firstArgument)) {
          const globPattern = firstArgument.getLiteralText()
          const globDirectory = globParent(globPattern)
          const baseGlobPattern = dirname(globPattern)
          const isMdxPattern = globPattern.split(sep).at(-1)?.includes('mdx')
          let filePaths = await glob(
            isMdxPattern
              ? globPattern
              : [
                  join(baseGlobPattern, sep, '*.examples.{ts,tsx}'),
                  join(baseGlobPattern, sep, 'examples', sep, '*.{ts,tsx}'),
                ],
            { cwd: workingDirectory }
          )

          /** Add context dependency for glob parent directory to watch for changes. */
          this.addContextDependency(globDirectory)

          /** Search for MDX files named the same as the source files (e.g. `Button.mdx` for `Button.tsx`) */
          if (!isMdxPattern) {
            const allSourceFilePaths = await glob(globPattern, {
              cwd: workingDirectory,
              ignore: ['**/*.examples.(ts|tsx)'],
            })
            const allMdxFilePaths = await glob(`${baseGlobPattern}/*.mdx`, {
              cwd: workingDirectory,
            })
            const allPaths = [...allSourceFilePaths, ...allMdxFilePaths]

            if (allPaths.length === 0) {
              throw new Error(
                `mdxts: Could not find any files matching ${globPattern}. Please provide a valid file pattern.`
              )
            }

            const optionsArgument = createSourceCall.getArguments()[1]
            const { sourceDirectory, outputDirectory } = (
              Node.isObjectLiteralExpression(optionsArgument)
                ? resolveObject(optionsArgument)
                : {}
            ) as {
              sourceDirectory?: string
              outputDirectory?: string
            }
            const entrySourceFiles = getEntrySourceFiles(
              project,
              allPaths,
              sourceDirectory,
              outputDirectory
            )
            const exportedSourceFiles = getExportedSourceFiles(entrySourceFiles)
            const exportedSourceFilePaths = entrySourceFiles
              .concat(exportedSourceFiles)
              .map((sourceFile) => sourceFile.getFilePath())

            /** Add MDX file paths that match README if index or are the same name as the source files. */
            allSourceFilePaths
              .filter((sourceFilePath) => {
                const resolvedSourceFilePath = resolve(sourceFilePath)
                const isExported = exportedSourceFilePaths.some(
                  (exportedSourceFilePath) => {
                    return exportedSourceFilePath === resolvedSourceFilePath
                  }
                )
                return isExported
              })
              .forEach((sourceFilePath) => {
                const sourceFilename = sourceFilePath.split(sep).pop() ?? ''
                const mdxFilePath = sourceFilename.includes('index')
                  ? join(dirname(sourceFilePath), 'README.mdx')
                  : sourceFilePath.replace(
                      sourceFilename,
                      sourceFilename.replace(/\.[^/.]+$/, '.mdx')
                    )
                if (allMdxFilePaths.includes(mdxFilePath)) {
                  filePaths.push(mdxFilePath)
                }
              })
          }

          filePaths = filePaths.map((filePath) =>
            resolve(workingDirectory, filePath)
          )

          filePaths.forEach((filePath) => {
            this.addDependency(filePath)
          })

          const objectLiteralText = `{${filePaths
            .map((filePath) => {
              const relativeFilePath = relative(workingDirectory, filePath)
              const normalizedRelativePath = relativeFilePath.startsWith('.')
                ? relativeFilePath
                : `.${sep}${relativeFilePath}`
              return `'${filePath}': () => import('${normalizedRelativePath}')`
            })
            .join(', ')}}`

          const argumentCount = createSourceCall.getArguments().length
          const createSourceCallArguments = []

          /** Insert empty options object if not provided. */
          if (argumentCount === 1) {
            createSourceCallArguments.push('{}')
          }

          /** Insert dynamic imports argument. */
          createSourceCallArguments.push(objectLiteralText)

          /** Insert resolved front matter type argument for type checking front matter properties. */
          const [typeArgument] = createSourceCall.getTypeArguments()

          if (typeArgument) {
            const typeProperties = typeArgument
              .getType()
              .getApparentProperties()
            const frontMatterProperty = typeProperties.find(
              (property) => property.getName() === 'frontMatter'
            )!

            if (frontMatterProperty) {
              const frontMatterType = frontMatterProperty
                .getValueDeclarationOrThrow()
                .getType()
                .getText()

              createSourceCallArguments.push(`"${frontMatterType}"`)
            }
          }

          createSourceCall.insertArguments(
            argumentCount,
            createSourceCallArguments
          )
        }
      } catch (error) {
        if (error instanceof Error) {
          callback(error)
        } else {
          throw error
        }
        return
      }
    }

    callback(null, sourceFile.getFullText())
  } else {
    callback(null, source)
  }
}
