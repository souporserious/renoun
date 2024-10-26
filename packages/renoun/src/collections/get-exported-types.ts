import { resolve } from 'node:path'

import { resolveType } from '../project/client.js'
import { getProject } from '../project/get-project.js'
import type { SymbolFilter } from '../utils/resolve-type.js'

export async function getExportedTypes(
  filePath: string,
  filter?: SymbolFilter,
  workingDirectory: string = process.cwd(),
  tsConfigFilePath: string = 'tsconfig.json'
) {
  const project = getProject({ tsConfigFilePath })

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
