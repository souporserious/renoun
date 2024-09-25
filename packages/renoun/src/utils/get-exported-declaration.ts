import type { ExportedDeclarations } from 'ts-morph'
import tsMorph from 'ts-morph'
const { Node } = tsMorph

/** Unwraps exported declarations from a source file. */
export function getExportedDeclaration(
  exportedDeclarations: ReadonlyMap<string, ExportedDeclarations[]>,
  name: string
) {
  const exportDeclarations = exportedDeclarations.get(name)

  if (!exportDeclarations) {
    return undefined
  }

  // Filter out types if multiple declarations are found
  if (exportDeclarations.length > 1) {
    const filteredExportDeclarations = exportDeclarations.filter(
      (declaration) =>
        !Node.isTypeAliasDeclaration(declaration) &&
        !Node.isInterfaceDeclaration(declaration) &&
        !Node.isPropertyAccessExpression(declaration.getParentOrThrow())
    )

    if (filteredExportDeclarations.length > 1) {
      const filePath = exportDeclarations[0]
        .getSourceFile()
        .getFilePath()
        .replace(process.cwd(), '')

      throw new Error(
        `[renoun] Multiple declarations found for export after filtering type aliases, interfaces, and property access expressions in source file at ${filePath}. Only one export declaration is currently allowed. Please file an issue for support.`
      )
    }

    return filteredExportDeclarations[0]
  }

  return exportDeclarations[0]
}
