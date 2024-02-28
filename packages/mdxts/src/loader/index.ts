import * as webpack from 'webpack'
import { dirname, basename, join, relative, resolve, sep } from 'node:path'
import { existsSync } from 'node:fs'
import { glob } from 'fast-glob'
import { Node, Project, SyntaxKind } from 'ts-morph'
import matter from 'gray-matter'

import { project } from '../components/project'
import { getExportedSourceFiles } from '../utils/get-exported-source-files'
import { findCommonRootPath } from '../utils/find-common-root-path'

/**
 * Exports front matter data for MDX files and augments `createSource` calls with MDX file paths resolved from the provided file pattern.
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

  /** Add theme to Next.js entry layout files and examples. */
  const isExample = this.resourcePath.endsWith('.examples.tsx')
  if (
    !source.includes('import theme') &&
    (isNextJsEntryLayout(this.resourcePath) || isExample) &&
    options.themePath
  ) {
    let relativeThemePath = relative(workingDirectory, options.themePath)

    if (options.themePath.endsWith('.json') && !existsSync(options.themePath)) {
      throw new Error(
        `mdxts: Could not find theme at ${options.themePath} or ${relativeThemePath}. Please provide a valid theme path.`
      )
    }

    if (!options.themePath.endsWith('.json')) {
      relativeThemePath = `shiki/themes/${options.themePath}.json`
    }

    if (isExample) {
      /** Examples don't inherit `setTheme` below so we explicitly import the theme and pass it to the components. */
      source = `${source}\nimport theme from '${relativeThemePath}';`
        .replaceAll(
          '<CodeBlock',
          `<CodeBlock theme={theme} workingDirectory="${workingDirectory}"`
        )
        .replaceAll(
          '<CodeInline',
          `<CodeInline theme={theme} workingDirectory="${workingDirectory}"`
        )
        .replaceAll(
          '<ExportedTypes',
          `<ExportedTypes theme={theme} workingDirectory="${workingDirectory}"`
        )
    } else {
      source = `${source}\nimport { setTheme } from 'mdxts';\nimport theme from '${relativeThemePath}';\nsetTheme(theme);`
    }
  }

  /** Augment CodeBlock, CodeInline, and ExportedTypes components to add the working directory. */
  const isMDXComponentImported =
    /import\s+{\s*([^}]*\b(CodeBlock|CodeInline|ExportedTypes)\b[^}]*)\s*}\s*from\s+['"]mdxts\/components.*['"]/g.test(
      sourceString
    )

  if (isMDXComponentImported) {
    source = source
      .toString()
      .replaceAll(
        '<CodeBlock',
        `<CodeBlock workingDirectory="${workingDirectory}"`
      )
      .replaceAll(
        '<CodeInline',
        `<CodeInline workingDirectory="${workingDirectory}"`
      )
      .replaceAll(
        '<ExportedTypes',
        `<ExportedTypes workingDirectory="${workingDirectory}"`
      )
  }

  /** Augment `createSource` calls with MDX/TypeScript file paths. */
  const isCreateSourceImported =
    /.*import\s\{[^}]*createSource[^}]*\}\sfrom\s['"]mdxts['"].*/.test(
      sourceString
    )

  if (isCreateSourceImported) {
    const sourceFile = new Project({
      useInMemoryFileSystem: true,
    }).createSourceFile('index.ts', sourceString)
    const createSourceCalls = sourceFile
      .getDescendantsOfKind(SyntaxKind.CallExpression)
      .filter((call) => call.getExpression().getText() === 'createSource')

    for (const call of createSourceCalls) {
      try {
        const [firstArgument] = call.getArguments()

        if (Node.isStringLiteral(firstArgument)) {
          const globPattern = firstArgument.getLiteralText()
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

            if (allPaths.length === 0) {
              throw new Error(
                `mdxts: Could not find any files matching ${globPattern}. Please provide a valid file pattern.`
              )
            }

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
    dirname(filePath).replace(join(process.cwd(), sep), ''),
    basename(filePath)
  )
  return [
    'app/layout.js',
    'src/app/layout.js',
    'app/layout.jsx',
    'src/app/layout.jsx',
    'app/layout.tsx',
    'src/app/layout.tsx',
  ].includes(topLevelPath)
}
