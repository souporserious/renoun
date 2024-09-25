import { resolve, dirname } from 'node:path'

import { getProject } from '../project/get-project.js'
import { resolveTsConfigPath } from '../utils/resolve-ts-config-path.js'

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
