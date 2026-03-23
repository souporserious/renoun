import type { Project } from './ts-morph.ts'

import { getDebugLogger } from './debug.ts'
import {
  getFileExportDeclaration,
  getFileExports,
} from './get-file-exports.ts'
import { resolveType, type Kind, type TypeFilter } from './resolve-type.ts'

export interface ResolvedFileExportsResult {
  resolvedTypes: Kind[]
  dependencies: string[]
}

/**
 * Resolve all file export types in a single analysis pass.
 *
 * This avoids the repeated per-export RPC/cache overhead that large barrel
 * files would otherwise pay when rendering `<Reference source={file} />`.
 */
export async function resolveFileExportsWithDependencies(
  project: Project,
  filePath: string,
  filter?: TypeFilter
): Promise<ResolvedFileExportsResult> {
  return getDebugLogger().trackOperation(
    'resolve-file-exports-with-dependencies',
    async () => {
      const fileExports = getFileExports(filePath, project)
      const dependencies = new Set<string>([filePath])
      const resolvedTypes: Kind[] = []

      for (const fileExport of fileExports) {
        dependencies.add(fileExport.path)

        const exportDeclaration = getFileExportDeclaration(
          fileExport.path,
          fileExport.position,
          fileExport.kind,
          project
        )
        const resolvedType = resolveType(
          exportDeclaration.getType(),
          exportDeclaration,
          filter,
          undefined,
          dependencies
        )

        if (resolvedType) {
          resolvedTypes.push(resolvedType)
        }
      }

      return {
        resolvedTypes,
        dependencies: Array.from(dependencies),
      }
    },
    {
      data: {
        filePath,
      },
    }
  ) as Promise<ResolvedFileExportsResult>
}
