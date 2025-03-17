import type { Project } from 'ts-morph'
import * as tsMorph from 'ts-morph'

import { getFileExportsText } from './get-file-exports-text.js'
import { getFileExportDeclaration } from './get-file-exports.js'

/** Temporary offset to adjust the position of file exports until getFileExports and getFileExportsText can be normalized. */
const fileExportPositionOffset = 2

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
  if (includeDependencies) {
    const fileExportsText = getCachedFileExportsText(filePath, project)
    const fileExportText = fileExportsText.find((fileExport) => {
      return (
        fileExport.position - fileExportPositionOffset === position &&
        fileExport.kind === kind
      )
    })

    if (!fileExportText) {
      throw new Error(
        `[renoun] Could not find export at position ${position} and kind ${kind} in ${filePath}.`
      )
    }

    return fileExportText.text
  }

  const exportDeclaration = getFileExportDeclaration(
    filePath,
    position,
    kind,
    project
  )

  return exportDeclaration.getText()
}

const fileExportsTextCache = new Map<
  string,
  ReturnType<typeof getFileExportsText>
>()

function getCachedFileExportsText(filePath: string, project: Project) {
  if (fileExportsTextCache.has(filePath)) {
    return fileExportsTextCache.get(filePath)!
  }

  const fileExportsText = getFileExportsText(filePath, project)

  fileExportsTextCache.set(filePath, fileExportsText)

  return fileExportsText
}
