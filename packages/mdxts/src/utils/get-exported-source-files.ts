import { SourceFile } from 'ts-morph'
import { hasInternalJsDocTag } from './has-internal-js-doc-tag'

/** Gets all source files exported from a set of source files excluding internal declarations. */
export function getExportedSourceFiles(sourceFiles: SourceFile[]) {
  return Array.from(
    new Set(
      sourceFiles.flatMap((sourceFile) =>
        Array.from(sourceFile.getExportedDeclarations()).flatMap(
          ([, allDeclarations]) =>
            allDeclarations
              .filter((declaration) => !hasInternalJsDocTag(declaration))
              .map((declaration) => declaration.getSourceFile())
        )
      )
    )
  )
}
