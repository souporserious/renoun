import * as webpack from 'webpack'
import { glob } from 'fast-glob'
import { dirname, resolve } from 'node:path'
import { Node, Project, SyntaxKind } from 'ts-morph'

export default async function loader(
  this: webpack.LoaderContext<{}>,
  source: string | Buffer
) {
  this.cacheable(true)
  const callback = this.async()

  if (
    /.*import\s\{\screateSourceFiles\s\}\sfrom\s['"]mdxts['"].*/.test(
      source.toString()
    )
  ) {
    const project = new Project({
      useInMemoryFileSystem: true,
    })
    const sourceFile = project.createSourceFile('index.ts', source.toString())
    const createSourceFilesCalls = sourceFile
      .getDescendantsOfKind(SyntaxKind.CallExpression)
      .filter((call) => call.getExpression().getText() === 'createSourceFiles')

    for (const call of createSourceFilesCalls) {
      try {
        const [firstArgument] = call.getArguments()

        if (Node.isStringLiteral(firstArgument)) {
          const globPattern = firstArgument.getLiteralText()
          const filePaths = await glob(
            // if globPattern does not include mdx look for the cloest mdx file if it exists
            // the mdx file can be a README or a file named the same in the same directory
            globPattern.includes('mdx')
              ? globPattern
              : `${dirname(globPattern)}/*.mdx`,
            { cwd: dirname(this.resourcePath) }
          )
          const objectLiteralText = `{${filePaths
            .map((filePath) => {
              const pathname = getPathnameFromFilename(
                resolve(dirname(this.resourcePath), filePath).replace(
                  `${process.cwd()}/`,
                  ''
                )
              )
              return `"${pathname}": import('${filePath}')`
            })
            .join(', ')}}`

          call.insertArguments(0, [objectLiteralText])
        }
      } catch (error) {
        callback(error)
        return
      }
    }

    const modifiedSource = sourceFile.getFullText()
    callback(null, modifiedSource)
  } else {
    callback(null, source)
  }
}

function getPathnameFromFilename(filename: string) {
  return (
    filename
      // Remove file extensions
      .replace(/\.[^/.]+$/, '')
      // Remove leading "./"
      .replace(/^\.\//, '')
      // Remove leading sorting number
      .replace(/\/\d+\./g, '/')
  )
}
