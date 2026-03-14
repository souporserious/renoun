import { pathToFileURL } from 'node:url'

import {
  createFileSystemCacheToken,
  getFileSystemCacheTokenParts,
} from '../file-system/cache-token.ts'

const CACHE_TOKEN_USAGE = `Usage: renoun cache-token [--json]`

export async function runCacheTokenCommand(
  arguments_: string[] = []
): Promise<void> {
  let shouldOutputJson = false

  for (const argument of arguments_) {
    if (argument === '--json') {
      shouldOutputJson = true
      continue
    }

    if (argument === '--help' || argument === '-h') {
      console.log(CACHE_TOKEN_USAGE)
      return
    }

    throw new Error(
      `[renoun] Unknown option "${argument}".\n${CACHE_TOKEN_USAGE}`
    )
  }

  const token = createFileSystemCacheToken()

  if (shouldOutputJson) {
    console.log(
      JSON.stringify(
        {
          token,
          parts: getFileSystemCacheTokenParts(),
        },
        null,
        2
      )
    )
    return
  }

  console.log(token)
}

function isDirectInvocation(): boolean {
  const invokedPath = process.argv[1]
  if (!invokedPath) {
    return false
  }

  return import.meta.url === pathToFileURL(invokedPath).href
}

if (isDirectInvocation()) {
  runCacheTokenCommand(process.argv.slice(2)).catch((error) => {
    const message = error instanceof Error ? error.message : String(error)
    console.error(message)
    process.exit(1)
  })
}
