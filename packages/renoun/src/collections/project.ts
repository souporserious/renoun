import type { Project } from 'ts-morph'
import tsMorph from 'ts-morph'
import { resolve } from 'node:path'

import { resolveType } from '../project/index.js'
import type { SymbolFilter } from '../utils/resolve-type.js'

const projectCache = new Map<string, Project>()

export function getProject(
  tsConfigFilePath: string = 'tsconfig.json'
): Project {
  if (!projectCache.has(tsConfigFilePath)) {
    const project = new tsMorph.Project({
      skipAddingFilesFromTsConfig: true,
      tsConfigFilePath,
    })
    projectCache.set(tsConfigFilePath, project)
  }
  return projectCache.get(tsConfigFilePath)!
}

export async function getExportedTypes(
  filePath: string,
  filter?: SymbolFilter,
  workingDirectory: string = process.cwd(),
  tsConfigFilePath: string = 'tsconfig.json'
) {
  const project = getProject(tsConfigFilePath)

  try {
    const resolvedFilePath = resolve(workingDirectory, filePath)
    const sourceFile = project.addSourceFileAtPath(resolvedFilePath)
    const exportedDeclarations = Array.from(
      sourceFile.getExportedDeclarations()
    )

    return Promise.all(
      exportedDeclarations.flatMap(([, declarations]) => {
        return declarations.flatMap((declaration) =>
          resolveType({
            declaration,
            filter,
            projectOptions: { tsConfigFilePath },
          })
        )
      })
    )
  } catch (error) {
    throw new Error(
      `Failed to add source file at path: ${filePath}\nCurrent working directory: ${workingDirectory}`,
      { cause: error }
    )
  }
}
