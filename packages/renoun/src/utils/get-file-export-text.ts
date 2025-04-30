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
      const sourceFile = project.getSourceFile(filePath)
      const fullText = sourceFile ? sourceFile.getFullText() : ''
      const trimmedFilePath = filePath.replace(getRootDirectory(), '')
      const { line, column } = sourceFile
        ? sourceFile.getLineAndColumnAtPos(position)
        : { line: 0, column: 0 }
      const kindName = tsMorph.SyntaxKind[kind] ?? String(kind)
      const allLines = fullText.split(/\r?\n/)
      const before = allLines[line - 2]
      const current = allLines[line - 1]
      const after = allLines[line]

      // Build the snippet
      const snippetLines: string[] = []
      if (line > 1) {
        snippetLines.push(`${line - 1}: ${before}`)
      }
      snippetLines.push(`${line}: ${current}`)

      // Add a marker for the column
      const prefixLength = String(line).length + 2
      const markerPad = prefixLength + (column - 1)
      snippetLines.push(' '.repeat(markerPad) + '^', `${line + 1}: ${after}`)

      const snippet = snippetLines.join('\n')

      throw new Error(
        `[renoun] Could not find export of kind "${kindName}" at position ${position} in "${trimmedFilePath}" (line ${line}, column ${column}).\n\n${snippet}\n`
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
