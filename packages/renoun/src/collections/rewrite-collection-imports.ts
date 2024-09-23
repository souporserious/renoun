import type { Project } from 'ts-morph'

import { PACKAGE_NAME, PACKAGE_IMPORT_DIRECTORY } from './constants.js'

/**
 * Finds and rewrites all import statements from 'renoun/collections' to '#renoun/collections'
 * @internal
 */
export function rewriteCollectionImports(project: Project) {
  project.getSourceFiles().forEach((sourceFile) => {
    sourceFile.getImportDeclarations().forEach((importDeclaration) => {
      const importPath = importDeclaration.getModuleSpecifierValue()

      if (importPath === `${PACKAGE_NAME}/collections`) {
        importDeclaration.setModuleSpecifier(
          `${PACKAGE_IMPORT_DIRECTORY}/collections`
        )
      }
    })
  })

  project.saveSync()
}
