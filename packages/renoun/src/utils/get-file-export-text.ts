import type { Project } from 'ts-morph'
import * as tsMorph from 'ts-morph'

import { getExportDeclarationTextWithDependencies } from './get-export-declaration-text-with-dependencies.js'
import { getFileExportDeclaration } from './get-file-exports.js'

/** Get a specific file export's text by identifier, optionally including its dependencies. */
export async function getFileExportText({
  filePath,
  position,
  kind,
  project,
  includeDependencies,
}: {
  filePath: string
  position: number
  kind: tsMorph.SyntaxKind
  project: Project
  includeDependencies?: boolean
}) {
  const sourceFile = project.getSourceFile(filePath)

  if (!sourceFile) {
    throw new Error(`[renoun] Source file not found: ${filePath}`)
  }

  const exportDeclaration = getFileExportDeclaration(
    filePath,
    position,
    kind,
    project
  )

  if (includeDependencies) {
    return getExportDeclarationTextWithDependencies(exportDeclaration)
  }

  return exportDeclaration.getText()
}
