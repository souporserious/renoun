import type { Project } from 'ts-morph'
import tsMorph from 'ts-morph'

import { writeCollectionImportMaps } from './write-collection-import-maps.js'

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
