import { resolve } from 'path'

import { getPackageMetadata } from './get-package-metadata.js'

const extensionPatterns = [
  '.{js,jsx,ts,tsx}',
  '.{examples,test}.{js,jsx,ts,tsx}',
]

/** Returns public source files based on package.json exports. */
export function getPublicPaths(
  packageMetadata: ReturnType<typeof getPackageMetadata>,
  sourceDirectory = 'src',
  outputDirectory: string | string[] = 'dist'
): string[] {
  if (typeof outputDirectory === 'string') {
    outputDirectory = [outputDirectory]
  }

  let entrySourceFilePaths: string[] = []

  // Use package.json exports for calculating public paths if they exist.
  if (packageMetadata?.exports) {
    for (const exportKey in packageMetadata.exports) {
      const exportValue = packageMetadata.exports[exportKey]
      let exportPath = exportValue

      if (typeof exportValue === 'object') {
        /* Could also not exist if it's CJS only for example */
        if (exportValue.import) {
          exportPath = exportValue.import
        }

        /*
         * Handle nested export statements e.g.
         * "import": {
         *   "types": "./dist/es/tailwind.d.mts",
         *   "default": "./dist/es/tailwind.mjs"
         * },
         */
        if (typeof exportValue.import === 'object') {
          exportPath = exportValue.import.default
        }
      }

      const sourceFilePaths = extensionPatterns
        .flatMap((pattern, index) =>
          (outputDirectory as string[]).map((directory) => {
            if (!exportPath.includes(directory)) {
              return
            }
            const exportPattern = exportPath
              .replace(directory, sourceDirectory)
              .replace(/\.js$/, pattern)
            const sourcePathPattern = resolve(
              packageMetadata.directory,
              exportPattern
            )
            // Include the first pattern and exclude examples and tests.
            return index === 0 ? sourcePathPattern : `!${sourcePathPattern}`
          })
        )
        .filter(Boolean) as string[]

      entrySourceFilePaths.push(...sourceFilePaths)
    }
  }

  return entrySourceFilePaths
}
