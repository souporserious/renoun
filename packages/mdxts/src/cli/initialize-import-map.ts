import { existsSync, mkdirSync, writeFileSync } from 'fs'
import globParent from 'glob-parent'
import { Project, Node, SyntaxKind, SourceFile } from 'ts-morph'
import AliasesFromTSConfig from 'aliases-from-tsconfig'

/**
 * Generates the initial import maps for each file pattern at the root of the project.
 *
 * @param patterns - An array of file patterns to match.
 * @param sourceFilesMap - A map of file patterns to their respective source files.
 */
function initializeImportMap(
  patterns: string[],
  sourceFilesMap: Map<string, SourceFile[]>
) {
  if (!existsSync('.mdxts')) {
    mkdirSync('.mdxts')
  }

  const importMapEntries = patterns.flatMap((filePattern) => {
    const sourceFiles = sourceFilesMap.get(filePattern) || []
    const baseGlobPattern = globParent(filePattern)
    const allExtensions = Array.from(
      new Set(sourceFiles.map((sourceFile) => sourceFile.getExtension()))
    )

    return allExtensions.map((extension) => {
      const trimmedExtension = extension.slice(1)
      return `  ['${trimmedExtension}:${filePattern}', (slug) => import(\`${baseGlobPattern}/\${slug}${extension}\`)]`
    })
  })

  const packageName = 'project'

  writeFileSync(
    '.mdxts/index.js',
    [
      `import { setImports } from 'node_modules/${packageName}';`,
      `setImports([\n${importMapEntries.join(',\n')}\n]);`,
      `export * from 'node_modules/${packageName}';`,
    ].join('\n')
  )
}

/**
 * Collects file patterns and their corresponding source files.
 *
 * @param filePatterns - An array of file patterns to match.
 * @param tsConfigFilePath - The path to the TypeScript configuration file.
 * @returns A map of file patterns to their respective source files.
 */
function collectSourceFiles(
  filePatterns: string[],
  tsConfigFilePath: string
): Map<string, SourceFile[]> {
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    tsConfigFilePath: tsConfigFilePath,
  })
  const aliases = new AliasesFromTSConfig(tsConfigFilePath)
  const sourceFilesMap = new Map<string, SourceFile[]>()

  filePatterns.forEach((filePattern) => {
    const absoluteGlobPattern = aliases.apply(filePattern)
    let sourceFiles = project.getSourceFiles(absoluteGlobPattern)

    if (sourceFiles.length === 0) {
      sourceFiles = project.addSourceFilesAtPaths(absoluteGlobPattern)
    }

    if (sourceFiles.length === 0) {
      throw new Error(`No source files found for pattern: ${filePattern}`)
    }

    sourceFilesMap.set(filePattern, sourceFiles)
  })

  return sourceFilesMap
}

/** Initializes an import map at the root of the project based on all `createCollection` file patterns. */
export function initializeImportMapFromCollections() {
  const filePatterns = new Set<string>()

  new Project({ tsConfigFilePath: 'tsconfig.json' })
    .createSourceFile(
      'collection.ts',
      `import { createCollection } from 'mdxts';`
    )
    .getFirstDescendantByKindOrThrow(SyntaxKind.Identifier)
    .findReferencesAsNodes()
    .forEach((node) => {
      const callExpression = node.getParent()
      if (Node.isCallExpression(callExpression)) {
        const argument = callExpression.getArguments().at(0)
        if (Node.isStringLiteral(argument)) {
          const filePattern = argument.getLiteralText()
          filePatterns.add(filePattern)
        }
      }
    })

  const filePatternsArray = Array.from(filePatterns)
  const sourceFilesMap = collectSourceFiles(filePatternsArray, 'tsconfig.json')

  initializeImportMap(filePatternsArray, sourceFilesMap)
}
