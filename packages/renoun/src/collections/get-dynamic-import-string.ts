import { extname, resolve, dirname, relative } from 'node:path'
import globParent from 'glob-parent'
import fastGlob from 'fast-glob'

import { getAbsoluteGlobPattern } from './get-absolute-glob-pattern.js'

export async function getDynamicImportString(
  filePattern: string,
  tsConfigFilePath: string = 'tsconfig.json'
) {
  const absoluteGlobPattern = await getAbsoluteGlobPattern(
    filePattern,
    tsConfigFilePath
  )
  const filePaths = await fastGlob.glob(absoluteGlobPattern)

  if (process.env.NODE_ENV === 'production' && filePaths.length === 0) {
    throw new Error(
      `[renoun] No source files found for collection while attempting to generate import map for file pattern: ${filePattern}
  
  You can fix this error by ensuring the following:
    
    - The file pattern is formatted correctly and targeting files that exist.
    - If using a relative path, ensure the "tsConfigFilePath" option is targeting the correct workspace.
    - If you continue to see this error, please file an issue: https://github.com/souporserious/renoun/issues\n`
    )
  }

  let relativeGlobPattern = relative(process.cwd(), absoluteGlobPattern)

  if (!relativeGlobPattern.startsWith('.')) {
    relativeGlobPattern = `./${relativeGlobPattern}`
  }

  const baseGlobPattern = globParent(relativeGlobPattern)
  const allExtensions = Array.from(new Set(filePaths.map(extname))).sort()

  return allExtensions.map((extension) => {
    return `(slug) => import(\`${baseGlobPattern}/\${slug}${extension}\`)`
  })
}

async function getFilePaths(filePattern: string, tsConfigFilePath: string) {
  const absoluteGlobPattern = await getAbsoluteGlobPattern(
    filePattern,
    tsConfigFilePath
  )
  return fastGlob.glob(absoluteGlobPattern)
}
