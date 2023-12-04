import * as webpack from 'webpack'
import { dirname } from 'node:path'
import { glob } from 'fast-glob'
import { Node, Project, SyntaxKind } from 'ts-morph'

/**
 * Augments `createSourceFiles` calls with MDX file paths resolved from the provided file pattern.
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
    /.*import\s\{\screateSourceFiles\s\}\sfrom\s['"]mdxts['"].*/.test(
      sourceString
    )
  ) {
    const project = new Project({ useInMemoryFileSystem: true })
    const sourceFile = project.createSourceFile('index.ts', sourceString)
    const createSourceFilesCalls = sourceFile
      .getDescendantsOfKind(SyntaxKind.CallExpression)
      .filter((call) => call.getExpression().getText() === 'createSourceFiles')

    for (const call of createSourceFilesCalls) {
      try {
        const [firstArgument] = call.getArguments()

        if (Node.isStringLiteral(firstArgument)) {
          const globPattern = firstArgument.getLiteralText()
          const filePaths = await glob(
            globPattern.includes('mdx')
              ? globPattern
              : `${dirname(globPattern)}/README.mdx`,
            { cwd: dirname(this.resourcePath) }
          )
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
