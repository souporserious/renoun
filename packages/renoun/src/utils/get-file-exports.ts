import type { Project } from 'ts-morph'

/** Returns metadata about the exports of a file. */
export function getFileExports(filePath: string, project: Project) {
  const sourceFile = project.addSourceFileAtPath(filePath)

  return sourceFile.getExportSymbols().map((symbol) => {
    return {
      name: symbol.getName(),
    }
  })
}
