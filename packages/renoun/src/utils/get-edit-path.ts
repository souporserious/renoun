import { join, posix } from 'node:path'

import { getRootDirectory } from '../utils/get-root-directory.js'
import { getEditorUri } from './get-editor-uri.js'
import { getGitFileUrl } from '../utils/get-git-file-url.js'
import { loadConfig } from '../utils/load-config.js'

const warned = new Set<string>()
let rootDirectory: string | null = null

/** Returns an edit path for the local IDE in development or a git source link in production if configured. */
export function getEditPath(
  path: string,
  line?: number,
  column?: number,
  gitSource?: string,
  gitBranch?: string,
  gitProvider?: string
) {
  const config = loadConfig()

  if (gitSource === undefined) {
    gitSource = config.git?.source
  }

  if (gitBranch === undefined) {
    gitBranch = config.git?.branch
  }

  if (gitProvider === undefined) {
    gitProvider = config.git?.provider
  }

  if (process.env.NODE_ENV === 'development') {
    return getEditorUri({ path, line, column })
  }

  if (process.env.NODE_ENV === 'production' && gitSource !== undefined) {
    if (rootDirectory === null) {
      rootDirectory = getRootDirectory()
    }

    const relativeFilePath = path.replace(join(rootDirectory, posix.sep), '')

    if (gitSource === undefined) {
      if (!warned.has(relativeFilePath)) {
        console.warn(
          `[renoun] \`getSourcePath\` could not determine the source path for "${relativeFilePath}". Ensure the \`gitSource\` property in the \`renoun.json\` at the root of your project is configured correctly. For more information, visit: https://renoun.dev/docs/configuration`
        )
        warned.add(relativeFilePath)
      }

      return ''
    }

    return getGitFileUrl(
      relativeFilePath,
      line,
      column,
      gitSource!,
      gitBranch,
      gitProvider
    )
  }

  return ''
}
