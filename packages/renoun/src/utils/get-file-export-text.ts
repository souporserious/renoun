import { getTsMorph } from './ts-morph.ts'
import type { Project, SyntaxKind } from './ts-morph.ts'

import { createProgramFileCache } from '../analysis/cache.ts'
import { getFileExportDeclaration } from './get-file-exports.ts'
import { getFileExportsTextWithDependencies } from './get-file-exports-text.ts'
import { getRootDirectory } from './get-root-directory.ts'

const tsMorph = getTsMorph()

export interface FileExportTextResult {
  text: string
  dependencies: string[]
}

function toProgramFileDependencies(paths: Iterable<string>) {
  const dependencyPaths = new Set<string>()
  for (const path of paths) {
    if (typeof path !== 'string' || path.length === 0) {
      continue
    }

    dependencyPaths.add(path)
  }

  return Array.from(dependencyPaths).map((path) => ({
    kind: 'file' as const,
    path,
  }))
}

function toMissingFileExportError(options: {
  filePath: string
  position: number
  kind: SyntaxKind
  project: Project
}): Error {
  const { filePath, position, kind, project } = options
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

  const snippetLines: string[] = []
  if (line > 1) {
    snippetLines.push(`${line - 1}: ${before}`)
  }
  snippetLines.push(`${line}: ${current}`)

  const prefixLength = String(line).length + 2
  const markerPad = prefixLength + (column - 1)
  snippetLines.push(' '.repeat(markerPad) + '^', `${line + 1}: ${after}`)

  const snippet = snippetLines.join('\n')

  return new Error(
    `[renoun] Could not find export of kind "${kindName}" at position ${position} in "${trimmedFilePath}" (line ${line}, column ${column}).\n\n${snippet}\n`
  )
}

export async function getFileExportTextResult({
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
}): Promise<FileExportTextResult> {
  if (includeDependencies) {
    const fileExportsText = await createProgramFileCache(
      project,
      filePath,
      'fileExportsText',
      () => getFileExportsTextWithDependencies(filePath, project),
      {
        deps: (result) => {
          return toProgramFileDependencies(
            result.flatMap((fileExport) => fileExport.dependencyPaths)
          )
        },
      }
    )
    const fileExportText = fileExportsText.find((fileExport) => {
      return fileExport.position === position && fileExport.kind === kind
    })

    if (!fileExportText) {
      throw toMissingFileExportError({
        filePath,
        position,
        kind,
        project,
      })
    }

    return {
      text: fileExportText.text,
      dependencies: [...fileExportText.dependencyPaths],
    }
  }

  const exportDeclaration = getFileExportDeclaration(
    filePath,
    position,
    kind,
    project
  )

  return {
    text: exportDeclaration.getText(),
    dependencies: [filePath],
  }
}

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
  const result = await getFileExportTextResult({
    filePath,
    position,
    kind,
    project,
    includeDependencies,
  })

  return result.text
}
