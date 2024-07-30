import type { SourceFile } from 'ts-morph'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import globParent from 'glob-parent'

const PACKAGE_NAME = 'mdxts/core'
const PACKAGE_DIRECTORY = '.mdxts'

type GetImport<Exports extends unknown = unknown> = (
  slug: string
) => Promise<Exports>

let importMaps = new Map<string, GetImport>()

/**
 * Sets the import maps for a collection's file patterns.
 *
 * @internal
 * @param importMapEntries - An array of tuples where the first element is a file pattern and the second element is a function that returns a promise resolving to the import.
 */
export function setImports(importMapEntries: [string, GetImport][]) {
  importMaps = new Map(importMapEntries)
}

/**
 * Retreives the import map for a collection's file pattern.
 *
 * @internal
 * @param slug - The file pattern to retrieve the import map for.
 * @returns The import map for the file pattern.
 */
export function getImportMap<AllExports>(slug: string) {
  return importMaps.get(slug) as GetImport<AllExports>
}

/** Updates the import map for a file pattern and its source files. */
export function updateImportMap(
  filePattern: string,
  sourceFiles: SourceFile[]
) {
  const baseGlobPattern = globParent(filePattern)
  const allExtensions = Array.from(
    new Set(sourceFiles.map((sourceFile) => sourceFile.getExtension()))
  )
  const nextImportMapEntries = allExtensions.map((extension) => {
    const trimmedExtension = extension.slice(1)
    return `['${trimmedExtension}:${filePattern}', (slug) => import(\`${baseGlobPattern}/\${slug}${extension}\`)]`
  })
  let previousImportMapEntries: string[] = []

  if (existsSync(`${PACKAGE_DIRECTORY}/index.js`)) {
    const previousImportMapLines = readFileSync(
      `${PACKAGE_DIRECTORY}/index.js`,
      'utf-8'
    )
      .split('\n')
      .filter(Boolean)
    const importMapStartIndex = previousImportMapLines.findIndex((line) =>
      line.includes('setImports([')
    )
    const importMapEndIndex = previousImportMapLines.findIndex((line) =>
      line.includes(']);')
    )
    previousImportMapEntries = previousImportMapLines
      .slice(importMapStartIndex + 1, importMapEndIndex)
      .map(
        // trim space and reomve trailing comma if present
        (line) => line.trim().replace(/,$/, '')
      )
  }

  const mergedImportMapEntries = Array.from(
    new Set(
      previousImportMapEntries.concat(nextImportMapEntries).filter(Boolean)
    )
  )
  const importMapEntriesString = mergedImportMapEntries
    .map((entry) => `  ${entry}`)
    .join(',\n')

  if (!existsSync(PACKAGE_DIRECTORY)) {
    mkdirSync(PACKAGE_DIRECTORY)
  }

  writeFileSync(
    `${PACKAGE_DIRECTORY}/index.js`,
    [
      `import { setImports } from '${PACKAGE_NAME}';`,
      `setImports([\n${importMapEntriesString}\n]);`,
      `export * from '${PACKAGE_NAME}';`,
    ].join('\n')
  )
}
