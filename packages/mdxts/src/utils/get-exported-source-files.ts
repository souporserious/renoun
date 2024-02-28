import { SourceFile } from 'ts-morph'
import { hasJsDocTag } from '@tsxmod/utils'

/** Gets all source files exported from a set of source files excluding internal declarations. */
export function getExportedSourceFiles(sourceFiles: SourceFile[]) {
  return Array.from(
    new Set(
      sourceFiles.flatMap((sourceFile) =>
        Array.from(sourceFile.getExportedDeclarations()).flatMap(
          ([, allDeclarations]) =>
            allDeclarations
              .filter((declaration) => !hasJsDocTag(declaration, 'internal'))
              .map((declaration) => declaration.getSourceFile())
        )
      )
    )
  )
}
