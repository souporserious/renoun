import * as webpack from 'webpack'
import { dirname, basename, join, relative, resolve } from 'node:path'
import { glob } from 'fast-glob'
import { Node, Project, SyntaxKind } from 'ts-morph'
import matter from 'gray-matter'

import { project } from '../components/project'
import { getExportedSourceFiles } from '../utils/get-exported-source-files'
import { findCommonRootPath } from '../utils/find-common-root-path'

/**
 * Exports front matter data for MDX files and augments `createDataSource` calls with MDX file paths resolved from the provided file pattern.
 * If a TypeScript file pattern is provided, the closest README.mdx or MDX file with the same name will be used.
 */
export default async function loader(
  this: webpack.LoaderContext<{
    themePath?: string
  }>,
  source: string | Buffer
) {
  this.cacheable(true)
  const callback = this.async()
  const options = this.getOptions()
  const sourceString = source.toString()
  const workingDirectory = dirname(this.resourcePath)

  /** Add Next.js entry layout files to set the theme. */
  if (isNextJsEntryLayout(this.resourcePath) && options.themePath) {
    const relativeThemePath = relative(workingDirectory, options.themePath)
    // Normalize path for import (replace backslashes on Windows)
    const normalizedThemePath = relativeThemePath.split('\\').join('/')

    source = `import { setTheme } from 'mdxts';\nimport theme from '${normalizedThemePath}';\nsetTheme(theme);\n\n${source}`
  }

  /** Export front matter from MDX files. */
  if (this.resourcePath.endsWith('.mdx')) {
    try {
      const { data, content } = matter(sourceString)
      const hasData = Object.keys(data).length > 0
      const stringifiedData = hasData ? JSON.stringify(data) : 'null'
      callback(
        null,
        `export const frontMatter = ${stringifiedData}\n\n${content}`
      )
    } catch (error) {
      if (error instanceof Error) {
        callback(error)
      } else {
        throw error
      }
    }
    return
  }

  /** Augment `createDataSource` calls with MDX/TypeScript file paths. */
  if (
    /.*import\s\{\screateDataSource\s\}\sfrom\s['"]mdxts['"].*/.test(
      sourceString
    )
  ) {
    const sourceFile = new Project({
      useInMemoryFileSystem: true,
    }).createSourceFile('index.ts', sourceString)
    const createDataSourceCalls = sourceFile
      .getDescendantsOfKind(SyntaxKind.CallExpression)
      .filter((call) => call.getExpression().getText() === 'createDataSource')

    for (const call of createDataSourceCalls) {
      try {
        const [firstArgument] = call.getArguments()

        if (Node.isStringLiteral(firstArgument)) {
          const globPattern = firstArgument.getLiteralText()
          const baseGlobPattern = dirname(globPattern)
          const isMdxPattern = globPattern.split('/').at(-1)?.includes('mdx')
          let filePaths = await glob(
            isMdxPattern
              ? globPattern
              : [
                  `${baseGlobPattern}/*.examples.(ts|tsx)`,
                  `${baseGlobPattern}/examples/*.(ts|tsx)`,
                ],
            { cwd: workingDirectory }
          )

          /** Search for MDX files named the same as the source files (e.g. `Button.mdx` for `Button.tsx`) */
          if (!isMdxPattern) {
            const { readPackageUp } = await import('read-package-up')
            const allSourceFilePaths = await glob(globPattern, {
              cwd: workingDirectory,
              ignore: ['**/*.examples.(ts|tsx)'],
            })
            const allMdxFilePaths = await glob(`${baseGlobPattern}/*.mdx`, {
              cwd: workingDirectory,
            })
            const allPaths = [...allSourceFilePaths, ...allMdxFilePaths]
            const commonRootPath = findCommonRootPath(allPaths)
            const packageJson = (
              await readPackageUp({
                cwd: commonRootPath,
              })
            )?.packageJson
            const entrySourceFiles = project.addSourceFilesAtPaths(
              packageJson?.exports
                ? /** If package.json exports found use that for calculating public paths. */
                  Object.keys(packageJson.exports).map((key) =>
                    join(resolve(commonRootPath, key), 'index.(ts|tsx)')
                  )
                : /** Otherwise default to a root index file. */
                  resolve(commonRootPath, '**/index.(ts|tsx)')
            )
            const exportedSourceFiles = getExportedSourceFiles(entrySourceFiles)

            /** Add MDX files that match README if index or are the same name as the source files. */
            allSourceFilePaths
              .filter((sourceFilePath) => {
                const resolvedSourceFilePath = resolve(sourceFilePath)
                const isExported = exportedSourceFiles.some((sourceFile) => {
                  return sourceFile.getFilePath() === resolvedSourceFilePath
                })
                return isExported
              })
              .forEach((sourceFilePath) => {
                const sourceFilename = sourceFilePath.split('/').pop() ?? ''
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

          filePaths.forEach((filePath) => {
            this.addDependency(join(dirname(this.resourcePath), filePath))
          })

          const objectLiteralText = `{${filePaths
            .map((filePath) => `"${filePath}": import('${filePath}')`)
            .join(', ')}}`

          call.insertArguments(0, [objectLiteralText])
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

/** Returns true if the provided file path is a Next.js entry layout file. */
function isNextJsEntryLayout(filePath: string) {
  const topLevelPath = join(
    dirname(filePath).replace(`${process.cwd()}/`, ''),
    basename(filePath)
  )
  return (
    topLevelPath === 'app/layout.tsx' || topLevelPath === 'src/app/layout.js'
  )
}
