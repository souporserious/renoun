import type { Project } from 'ts-morph'
import tsMorph from 'ts-morph'

import { writeCollectionImportMaps } from './write-collection-import-maps.js'

type GetImport<Exports extends unknown = unknown> = (
  slug: string
) => Promise<Exports>

let importMap = new Map<string, GetImport>()

/**
 * Retreives the import map for a collection's file pattern.
 *
 * @internal
 * @param slug - The file pattern to retrieve the import map for.
 * @returns The import map for the file pattern.
 */
export function getImportMap<AllExports>(slug: string) {
  return importMap.get(slug) as GetImport<AllExports>
}

let project: Project

/** Initializes an import map at the root of the project based on all `createCollection` configurations. */
export async function generateCollectionImportMap(filename?: string) {
  /* Use a default project to find all collection configurations and generate the collection import map. */
  if (!project) {
    project = new tsMorph.Project({
      tsConfigFilePath: 'tsconfig.json',
      manipulationSettings: {
        indentationText: tsMorph.IndentationText.TwoSpaces,
      },
    })
  }

  /* Refresh source file if the contents changed. */
  if (filename) {
    const sourceFile = project.getSourceFile(filename)

    if (sourceFile) {
      await sourceFile.refreshFromFileSystem()
    }
  }

  writeCollectionImportMaps(project)
}
