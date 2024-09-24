import { extname, resolve, dirname, relative } from 'node:path'
import globParent from 'glob-parent'
import fastGlob from 'fast-glob'

import { getProject } from '../project/get-project.js'
import { resolveTsConfigPath } from '../utils/resolve-ts-config-path.js'

export async function parseImportMaps(
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

  const relativeGlobPattern = relative(process.cwd(), absoluteGlobPattern)
  const baseGlobPattern = globParent(relativeGlobPattern)
  const allExtensions = Array.from(new Set(filePaths.map(extname))).sort()

  return allExtensions.map((extension) => {
    return `(slug) => import(\`${baseGlobPattern}/\${slug}${extension}\`)`
  })
}

export async function getAbsoluteGlobPattern(
  filePattern: string,
  tsConfigFilePath: string
) {
  const project = await getProject({ tsConfigFilePath })
  const compilerOptions = project.getCompilerOptions()
  const tsConfigDirectory = tsConfigFilePath
    ? dirname(String(compilerOptions.configFilePath))
    : project.getDirectoryOrThrow('.').getPath()

  return compilerOptions.baseUrl && compilerOptions.paths
    ? resolveTsConfigPath(
        tsConfigDirectory,
        compilerOptions.baseUrl,
        compilerOptions.paths,
        filePattern
      )
    : resolve(tsConfigDirectory, filePattern)
}

export async function getFilePaths(
  filePattern: string,
  tsConfigFilePath: string
) {
  const absoluteGlobPattern = await getAbsoluteGlobPattern(
    filePattern,
    tsConfigFilePath
  )
  return fastGlob.glob(absoluteGlobPattern)
}
