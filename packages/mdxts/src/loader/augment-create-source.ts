import { dirname, join, relative, resolve, posix, sep } from 'node:path'
import { glob } from 'fast-glob'
import globParent from 'glob-parent'
import { Node, Project, SyntaxKind } from 'ts-morph'
import { addComputedTypes, resolveObjectLiteralExpression } from '@tsxmod/utils'

import { project } from '../components/project'
import { getEntrySourceFiles } from '../utils/get-entry-source-files'
import { getExportedSourceFiles } from '../utils/get-exported-source-files'

/** Augments `createSource` call sites to add an additional argument of all dynamic imports based on the provided file pattern. */
export async function augmentCreateSource(
  sourceText: string,
  workingDirectory: string
) {
  const sourceFile = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: {
      lib: [
        'lib.es5.d.ts',
        'lib.es2015.symbol.d.ts',
        'lib.es2015.promise.d.ts',
        'lib.es2015.collection.d.ts',
        'lib.es2015.core.d.ts',
        'lib.es2015.iterable.d.ts',
        'lib.dom.d.ts',
      ],
    },
  }).createSourceFile('index.ts', sourceText)
  const createSourceCalls = sourceFile
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .filter((call) => call.getExpression().getText() === 'createSource')
  const allFilePaths = new Set<string>()

  // Add computed types to the source file to calculate flattened front matter types
  if (createSourceCalls.length > 0) {
    addComputedTypes(sourceFile)
  }

  for (const createSourceCall of createSourceCalls) {
    const [firstArgument] = createSourceCall.getArguments()

    if (Node.isStringLiteral(firstArgument)) {
      const globPattern = firstArgument.getLiteralText()
      const baseGlobPattern = dirname(globPattern)
      const isMdxPattern = globPattern.split(posix.sep).at(-1)?.includes('mdx')
      const filePatterns = isMdxPattern
        ? [globPattern]
        : [
            join(baseGlobPattern, sep, '*.examples.{ts,tsx}'),
            join(baseGlobPattern, sep, 'examples', sep, '*.{ts,tsx}'),
          ]
      let filePaths = await glob(
        filePatterns.map((filePath) => filePath.split(sep).join(posix.sep)),
        { cwd: workingDirectory }
      )

      /** Search for MDX files named the same as the source files (e.g. `Button.mdx` for `Button.tsx`) */
      if (!isMdxPattern) {
        const allSourceFilePaths = await glob(
          globPattern.split(sep).join(posix.sep),
          {
            cwd: workingDirectory,
            ignore: ['**/*.examples.(ts|tsx)'],
          }
        )
        const allMdxFilePaths = await glob(
          join(`${baseGlobPattern}`, sep, `*.mdx`).split(sep).join(posix.sep),
          { cwd: workingDirectory }
        )
        const allPaths = [...allSourceFilePaths, ...allMdxFilePaths]

        if (allPaths.length === 0) {
          throw new Error(
            `mdxts: Could not find any files matching ${globPattern}. Please provide a valid file pattern.`
          )
        }

        const optionsArgument = createSourceCall.getArguments()[1]
        const { sourceDirectory, outputDirectory } = (
          Node.isObjectLiteralExpression(optionsArgument)
            ? resolveObjectLiteralExpression(optionsArgument)
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
            const sourceFilename = sourceFilePath.split(posix.sep).pop() ?? ''
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

      const objectLiteralText = `{${filePaths
        .map((filePath) => {
          const normalizedFilePath = filePath.split(sep).join(posix.sep)
          const relativeFilePath = relative(
            workingDirectory,
            normalizedFilePath
          )
          const normalizedRelativePath = relativeFilePath.startsWith('.')
            ? relativeFilePath
            : `.${posix.sep}${relativeFilePath}`
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
        const typeProperties = typeArgument.getType().getApparentProperties()
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

      createSourceCall.insertArguments(argumentCount, createSourceCallArguments)

      /** Add all file path dependencies for the bundler to watch. */
      allFilePaths.add(globParent(globPattern))

      filePaths.forEach((filePath) => {
        allFilePaths.add(filePath)
      })
    }
  }

  return {
    sourceText: sourceFile.getText(),
    filePaths: allFilePaths,
  }
}
