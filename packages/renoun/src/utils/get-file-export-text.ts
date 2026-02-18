import { getTsMorph } from './ts-morph.ts'
import type { Project, SyntaxKind } from './ts-morph.ts'

import { createProjectFileCache } from '../project/cache.ts'
import { getFileExportDeclaration } from './get-file-exports.ts'
import { getFileExportsText } from './get-file-exports-text.ts'
import { getRootDirectory } from './get-root-directory.ts'

const tsMorph = getTsMorph()

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
  kind: SyntaxKind
  project: Project
  includeDependencies?: boolean
}) {
  if (includeDependencies) {
    const fileExportsText = await createProjectFileCache(
      project,
      filePath,
      'fileExportsText',
      () => getFileExportsText(filePath, project),
      {
        deps: [
          {
            kind: 'file',
            path: filePath,
          },
        ],
      }
    )
    const fileExportText = fileExportsText.find((fileExport) => {
      return fileExport.position === position && fileExport.kind === kind
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
