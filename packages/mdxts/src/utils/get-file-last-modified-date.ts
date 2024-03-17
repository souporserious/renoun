import { relative, resolve } from 'node:path'

import { getRepository } from './get-repository'

let hasWarnedIfShallow = false

/** Attempts to return the last modified date of a file based on its last commit. */
export function getFileLastModifiedDate(filePath: string) {
  const repository = getRepository()

  if (!repository) {
    return
  }

  if (!hasWarnedIfShallow) {
    if (repository.isShallow()) {
      const message = `[mdxts] This repository is shallow cloned so the last modified date will not be presented.`
      if (process.env.VERCEL) {
        console.warn(
          `${message} Set the VERCEL_DEEP_CLONE=true environment variable to enable deep cloning.`
        )
      } else if (process.env.GITHUB_ACTION) {
        console.warn(
          `${message} See https://github.com/actions/checkout#fetch-all-history-for-all-tags-and-branches to fetch all the history.`
        )
      } else {
        console.warn(message)
      }
    }
    hasWarnedIfShallow = true
  }

  const rootPath = resolve(repository.path(), '..')
  const relativeFilePath = relative(rootPath, filePath)

  try {
    return repository.getFileLatestModifiedDate(relativeFilePath)
  } catch {
    console.warn(
      `[mdxts] Could not find the last modified date for ${relativeFilePath}`
    )
  }
}
