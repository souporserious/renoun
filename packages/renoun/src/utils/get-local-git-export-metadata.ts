import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { getRootDirectory } from './get-root-directory.ts'

export interface GitExportMetadata {
  firstCommitDate?: Date
  lastCommitDate?: Date
}

const cache = new Map<string, GitExportMetadata>()
let isGitRepository: boolean | null = null

function createEmptyMetadata(): GitExportMetadata {
  return { firstCommitDate: undefined, lastCommitDate: undefined }
}

function getCacheKey(filePath: string, startLine: number, endLine: number) {
  return `${filePath}:${startLine}:${endLine}`
}

async function runGitBlame(
  filePath: string,
  startLine: number,
  endLine: number
) {
  return await new Promise<string>((resolve, reject) => {
    execFile(
      'git',
      [
        'blame',
        '--line-porcelain',
        '--follow',
        '-L',
        `${startLine},${endLine}`,
        '--',
        filePath,
      ],
      (error, stdout) => {
        if (error) {
          reject(error)
        } else {
          resolve(stdout.toString())
        }
      }
    )
  })
}

/** Returns aggregated git metadata for a specific export range. */
export async function getLocalGitExportMetadata(
  filePath: string,
  startLine: number,
  endLine: number
): Promise<GitExportMetadata> {
  const cacheKey = getCacheKey(filePath, startLine, endLine)

  if (cache.has(cacheKey)) {
    return cache.get(cacheKey)!
  }

  if (isGitRepository === null) {
    const rootDirectory = getRootDirectory()
    isGitRepository = existsSync(join(rootDirectory, '.git'))
  }

  if (!isGitRepository) {
    const empty = createEmptyMetadata()
    cache.set(cacheKey, empty)
    return empty
  }

  const normalizedStart = Math.max(1, Math.min(startLine, endLine))
  const normalizedEnd = Math.max(normalizedStart, Math.max(startLine, endLine))

  try {
    const stdout = await runGitBlame(filePath, normalizedStart, normalizedEnd)

    const lines = stdout.split('\n')
    let firstCommitDate: Date | undefined
    let lastCommitDate: Date | undefined

    for (const line of lines) {
      if (!line.startsWith('committer-time ')) {
        continue
      }

      const timestamp = Number(line.slice('committer-time '.length))
      if (!Number.isFinite(timestamp)) {
        continue
      }

      const date = new Date(timestamp * 1_000)
      if (Number.isNaN(date.getTime())) {
        continue
      }

      if (firstCommitDate === undefined || date < firstCommitDate) {
        firstCommitDate = date
      }
      if (lastCommitDate === undefined || date > lastCommitDate) {
        lastCommitDate = date
      }
    }

    const metadata: GitExportMetadata = {
      firstCommitDate,
      lastCommitDate,
    }

    cache.set(cacheKey, metadata)
    return metadata
  } catch {
    const empty = createEmptyMetadata()
    cache.set(cacheKey, empty)
    return empty
  }
}
