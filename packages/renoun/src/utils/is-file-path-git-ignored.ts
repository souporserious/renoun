import { readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import ignore from 'ignore'

import { getRootDirectory } from './get-root-directory.js'

let ignoreManager: ReturnType<typeof ignore>

/**
 * Check if a file path is ignored based on the root `.gitignore` file. This will
 * also ignore any file paths within the `.git` directory.
 */
export function isFilePathGitIgnored(filePath: string): boolean {
  if (filePath.includes('/.git/')) {
    return true
  }

  const relativePath = relative(getRootDirectory(), filePath)

  if (!ignoreManager) {
    const gitignorePatterns = getGitIgnorePatterns()
    ignoreManager = ignore().add(gitignorePatterns)
  }

  return ignoreManager.ignores(relativePath)
}

function getGitIgnorePatterns(): string[] {
  const gitignorePath = join(getRootDirectory(), '.gitignore')

  try {
    const gitignoreContent = readFileSync(gitignorePath, 'utf-8')

    return (
      gitignoreContent
        .split('\n')
        .map((line) => line.trim())
        // Filter out comments and empty lines
        .filter((line) => line && !line.startsWith('#'))
    )
  } catch (error) {
    // If .gitignore is not found, return an empty array
    return []
  }
}
