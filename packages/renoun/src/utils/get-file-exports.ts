import type { Project } from 'ts-morph'

export interface FileExport {
  name: string
  position: number
}

/** Returns metadata about the exports of a file. */
export function getFileExports(filePath: string, project: Project) {
  let sourceFile = project.getSourceFile(filePath)

  if (!sourceFile) {
    sourceFile = project.addSourceFileAtPath(filePath)
  }

  return Array.from(sourceFile.getExportedDeclarations()).flatMap(
    ([name, declarations]) => {
      return declarations.map((declaration) => ({
        name,
        position: declaration.getPos(),
      }))
    }
  )
}
