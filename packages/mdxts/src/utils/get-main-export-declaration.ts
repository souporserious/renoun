import { kebabCase } from 'case-anything'
import type { ExportedDeclarations, SourceFile } from 'ts-morph'

/**
 * Resolves the main export which will either be the default export
 * or an export with the same name as the kebab or camel case filename.
 */
export function getMainExportDeclaration(sourceFile: SourceFile) {
  const exportedDeclarations = sourceFile?.getExportedDeclarations()
  const defaultExportSymbol = sourceFile?.getDefaultExportSymbol()

  if (!exportedDeclarations) {
    return
  }

  const defaultExport = Array.from(exportedDeclarations).find(
    ([, [declaration]]) => {
      return defaultExportSymbol === declaration.getSymbol()
    }
  )
  const namedExport = Array.from(exportedDeclarations).find(([name]) => {
    const baseFilename = sourceFile.getBaseNameWithoutExtension()
    return name === baseFilename || kebabCase(name) === baseFilename
  })
  const mainExport = (defaultExport || namedExport)
    ?.at(1) // Get the declaration
    ?.at(0) // Get the first node

  return mainExport as ExportedDeclarations | undefined
}
