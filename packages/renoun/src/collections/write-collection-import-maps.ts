import type { Project } from 'ts-morph'
import tsMorph from 'ts-morph'

import { getAllCollections } from './get-all-collections.js'
import { parseImportMaps } from './parse-import-maps.js'

export async function writeCollectionImportMaps(project: Project) {
  const collections = (
    await Promise.all(
      getAllCollections(project).map(
        async ({ filePattern, options, optionsArgument }) => {
          const importMaps = await parseImportMaps(
            filePattern,
            options?.tsConfigFilePath
          )
          const nextImportMaps = `[${importMaps.join(', ')}]`
          const importMapProperty = optionsArgument.getProperty('importMap')

          if (importMapProperty) {
            if (tsMorph.Node.isPropertyAssignment(importMapProperty)) {
              const currentImportMap = importMapProperty
                .getInitializerOrThrow()
                .getText()

              if (
                normalizeImportMapString(currentImportMap) ===
                normalizeImportMapString(nextImportMaps)
              ) {
                return null
              }
            }

            const importMapPropertyIndex = optionsArgument
              .getProperties()
              .findIndex((property) => property === importMapProperty)

            importMapProperty.remove()

            optionsArgument.insertProperty(importMapPropertyIndex, {
              kind: tsMorph.StructureKind.PropertyAssignment,
              name: 'importMap',
              initializer: `[${importMaps.join(', ')}]`,
            })
          } else {
            optionsArgument.addPropertyAssignment({
              name: 'importMap',
              initializer: `[${importMaps.join(', ')}]`,
            })
          }

          optionsArgument.formatText()
        }
      )
    )
  ).filter((collection) => collection !== null)

  if (collections.length === 0) {
    return
  }

  return project.save()
}

/** Normalizes an import map string by formatting it consistently. */
function normalizeImportMapString(str: string): string {
  return (
    str
      // Remove parentheses around single parameters in arrow functions
      .replace(/\(\s*([a-zA-Z_$][0-9a-zA-Z_$]*)\s*\)\s*=>/g, '$1 =>')
      // Remove line breaks, extra spaces, and commas
      .replace(/[\s,]+/g, '')
  )
}
