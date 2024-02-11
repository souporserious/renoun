import { Node, SourceFile } from 'ts-morph'

/** Determines if a declaration is internal or not based on JSDoc tag presence. */
function hasInternalJsDocTag(node: Node) {
  if (Node.isJSDocable(node)) {
    const jsDocTags = node.getJsDocs().flatMap((doc) => doc.getTags())
    return jsDocTags.some((tag) => tag.getTagName() === 'internal')
  }
  return false
}

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
