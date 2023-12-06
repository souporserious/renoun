import * as webpack from 'webpack'
import { dirname, join } from 'node:path'
import { glob } from 'fast-glob'
import { Node, Project, SyntaxKind } from 'ts-morph'

/**
 * Augments `createDataSource` calls with MDX file paths resolved from the provided file pattern.
 * If a TypeScript file pattern is provided, the closest README.mdx or MDX file with the same name will be used.
 */
export default async function loader(
  this: webpack.LoaderContext<{}>,
  source: string | Buffer
) {
  this.cacheable(true)
  const callback = this.async()
  const sourceString = source.toString()

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

    for (const call of createDataSourceCalls) {
      try {
        const [firstArgument] = call.getArguments()

        if (Node.isStringLiteral(firstArgument)) {
          const globPattern = firstArgument.getLiteralText()
          const baseGlobPattern = dirname(globPattern)
          const filePaths = await glob(
            globPattern.includes('mdx')
              ? globPattern
              : [
                  `${baseGlobPattern}/README.mdx`,
                  `${baseGlobPattern}/*.examples.(ts|tsx)`,
                  `${baseGlobPattern}/examples/*.(ts|tsx)`,
                ],
            { cwd: dirname(this.resourcePath) }
          )

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
