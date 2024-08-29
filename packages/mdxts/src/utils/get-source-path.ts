import { join, posix } from 'node:path'

import { getEditorPath } from './get-editor-path'
import { getGitFileUrl } from './get-git-file-url'
import { getRootDirectory } from './get-root-directory'
import { loadConfig } from './load-config'

const warned = new Set<string>()
let rootDirectory: string | null = null

/**
 * Returns a constructed source path for the local IDE in development or a git link in production.
 */
export function getSourcePath(
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
          `[mdxts] \`getSourcePath\` could not determine the git source path for \`${relativeFilePath}\`. Configure the \`gitSource\` option at \`.mdxts/config.json\`.`
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
