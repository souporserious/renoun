import * as webpack from 'webpack'
import { dirname, join } from 'node:path'
import { glob } from 'fast-glob'
import { Node, Project, SyntaxKind } from 'ts-morph'
import matter from 'gray-matter'

/**
 * Exports front matter data for MDX files and augments `createDataSource` calls with MDX file paths resolved from the provided file pattern.
 * If a TypeScript file pattern is provided, the closest README.mdx or MDX file with the same name will be used.
 */
export default async function loader(
  this: webpack.LoaderContext<{}>,
  source: string | Buffer
) {
  this.cacheable(true)
  const callback = this.async()
  const sourceString = source.toString()

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
      callback(error)
    }
    return
  }

  if (
    /.*import\s\{\screateDataSource\s\}\sfrom\s['"]mdxts['"].*/.test(
      sourceString
    )
  ) {
    const project = new Project({ useInMemoryFileSystem: true })
    const sourceFile = project.createSourceFile('index.ts', sourceString)
    const createDataSourceCalls = sourceFile
      .getDescendantsOfKind(SyntaxKind.CallExpression)
      .filter((call) => call.getExpression().getText() === 'createDataSource')
    const workingDirectory = dirname(this.resourcePath)

    for (const call of createDataSourceCalls) {
      try {
        const [firstArgument] = call.getArguments()

        if (Node.isStringLiteral(firstArgument)) {
          const globPattern = firstArgument.getLiteralText()
          const baseGlobPattern = dirname(globPattern)
          const isMdxPattern = globPattern.split('/').at(-1).includes('mdx')
          let filePaths = await glob(
            isMdxPattern
              ? globPattern
              : [
                  `${baseGlobPattern}/README.mdx`,
                  `${baseGlobPattern}/*.examples.(ts|tsx)`,
                  `${baseGlobPattern}/examples/*.(ts|tsx)`,
                ],
            { cwd: workingDirectory }
          )

          /** Search for MDX files named the same as the source files (e.g. `Button.mdx` for `Button.tsx`) */
          if (!isMdxPattern) {
            const allSourceFilePaths = await glob(globPattern, {
              cwd: workingDirectory,
              ignore: ['**/*.examples.(ts|tsx)'],
            })
            const allMdxFilePaths = await glob(`${baseGlobPattern}/*.mdx`, {
              cwd: workingDirectory,
            })

            allSourceFilePaths.forEach((sourceFilePath) => {
              const sourceFilename = sourceFilePath.split('/').pop()
              const mdxFilename = sourceFilename.replace(/\.[^/.]+$/, '.mdx')
              const mdxFilePath = sourceFilePath.replace(
                sourceFilename,
                mdxFilename
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
        callback(error)
        return
      }
    }

    callback(null, sourceFile.getFullText())
  } else {
    callback(null, source)
  }
}
