import { existsSync } from 'node:fs'
import { resolve, join } from 'node:path'

import { getRootDirectory } from './get-root-directory.js'

/** Traverses up the directory tree to locate a file under a `.renoun` folder. */
export function getRenounFilePath(...parts: string[]) {
  const rootDirectory = getRootDirectory()
  let currentDirectory = process.cwd()

  while (currentDirectory !== rootDirectory) {
    const filePath = join(currentDirectory, '.renoun', ...parts)
    if (existsSync(filePath)) {
      return filePath
    }
    currentDirectory = resolve(currentDirectory, '..')
  }

  const filePath = join(rootDirectory, '.renoun', ...parts)
  if (existsSync(filePath)) {
    return filePath
  }

  throw new Error(
    `[renoun] File ".renoun/${parts.join('/')}" not found in the project directory (${rootDirectory}) or any of its parent directories up to the root directory (${rootDirectory}).`
  )
}
