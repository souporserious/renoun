import type { Directory, FunctionLikeDeclaration, SourceFile } from 'ts-morph'
import { SyntaxKind } from 'ts-morph'
import { extractExportByIdentifier } from '@tsxmod/utils'

/** Gathers examples from a declaration's JSDoc example tags. */
export function getExamplesFromComments(declaration: FunctionLikeDeclaration) {
  const docs = declaration.getJsDocs()

  return docs.flatMap(
    (doc) =>
      doc
        .getTags()
        .filter((tag) => tag.getTagName() === 'example')
        .map((tag) => tag.getCommentText())
        .filter(Boolean) as string[]
  )
}

/** Gathers examples from a source file with the same base name and `.examples` extension. */
export function getExamplesFromExtension(sourceFile: SourceFile) {
  const exampleSourceFile = sourceFile
    .getDirectory()
    .getSourceFile(
      `${sourceFile.getBaseNameWithoutExtension()}.examples${sourceFile.getExtension()}`
    )

  if (!exampleSourceFile) {
    return []
  }

  const exportedDeclarations = exampleSourceFile.getExportedDeclarations()

  return Array.from(exportedDeclarations).flatMap(([, declarations]) => {
    return declarations.map((declaration) =>
      extractExportByIdentifier(
        exampleSourceFile,
        declaration
          .getFirstDescendantByKindOrThrow(SyntaxKind.Identifier)
          .getText()
      )
    )
  })
}

/** Gathers examples from the closest `examples` directory. */
export function getExamplesFromDirectory(directory: Directory) {
  const examplesDirectory = directory.getDirectory('examples')

  if (!examplesDirectory) {
    return []
  }

  const sourceFiles = examplesDirectory.getSourceFiles()

  if (sourceFiles.length === 0) {
    return examplesDirectory.addSourceFilesAtPaths('**/*.{ts,tsx}')
  }

  return sourceFiles
}
