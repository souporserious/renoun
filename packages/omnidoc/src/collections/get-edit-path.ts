import { join, posix } from 'node:path'

import { getRootDirectory } from '../utils/get-root-directory'
import { getEditorPath } from '../utils/get-editor-path'
import { getGitFileUrl } from '../utils/get-git-file-url'
import { loadConfig } from '../utils/load-config'

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
    gitSource = config.gitSource
  }

  if (gitBranch === undefined) {
    gitBranch = config.gitBranch
  }

  if (gitProvider === undefined) {
    gitProvider = config.gitProvider
  }

  if (process.env.NODE_ENV === 'development') {
    return getEditorPath({ path, line, column })
  }

  if (process.env.NODE_ENV === 'production' && gitSource !== undefined) {
    if (rootDirectory === null) {
      rootDirectory = getRootDirectory()
    }

    const relativeFilePath = path.replace(join(rootDirectory, posix.sep), '')

    if (gitSource === undefined) {
      if (!warned.has(relativeFilePath)) {
        console.warn(
          `[omnidoc] \`getSourcePath\` could not determine the source path for "${relativeFilePath}". Ensure \`gitSource\` is configured at \`.omnidoc/config.json\`.`
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
