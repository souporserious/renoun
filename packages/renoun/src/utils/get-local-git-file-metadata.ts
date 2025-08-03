import { exec } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { getRootDirectory } from './get-root-directory.js'

export interface GitAuthor {
  name: string
  commitCount: number
  firstCommitDate: Date
  lastCommitDate: Date
}

export interface GitMetadata {
  authors: GitAuthor[]
  firstCommitDate?: Date
  lastCommitDate?: Date
}

const cache = new Map<string, GitMetadata>()
let isGitRepository: null | boolean = null
let hasCheckedIfShallow = false
let hadGitError = false

/** Returns aggregated metadata about a file from git history. */
export async function getLocalGitFileMetadata(
  filePath: string
): Promise<GitMetadata> {
  if (cache.has(filePath)) {
    return cache.get(filePath)!
  }

  if (isGitRepository === null) {
    const rootDirectory = getRootDirectory()
    isGitRepository = existsSync(join(rootDirectory, '.git'))
  }

  if (isGitRepository && !hasCheckedIfShallow) {
    try {
      const isShallow = await new Promise<string>((resolve, reject) => {
        exec('git rev-parse --is-shallow-repository', (error, stdout) => {
          if (error) {
            reject(error)
          } else {
            resolve(stdout.toString().trim())
          }
        })
      })

      if (isShallow === 'true') {
        const message = `[renoun] This repository is shallow cloned so the createdAt and updatedAt dates cannot be calculated correctly.`
        if ('VERCEL' in process.env) {
          throw new Error(
            `${message} Set the VERCEL_DEEP_CLONE=true environment variable to enable deep cloning.`
          )
        } else if ('GITHUB_ACTION' in process.env) {
          throw new Error(
            `${message} See https://github.com/actions/checkout#fetch-all-history-for-all-tags-and-branches to fetch the entire git history.`
          )
        }
        throw new Error(message)
      }

      hasCheckedIfShallow = true
    } catch {
      hadGitError = true
    }
  }

  if (!isGitRepository || hadGitError) {
    const result = {
      authors: [],
      createdAt: undefined,
      updatedAt: undefined,
    }
    cache.set(filePath, result)
    return result
  }

  const authorContributions = new Map<
    string,
    {
      name: string
      commitCount: number
      firstCommitDate: Date
      lastCommitDate: Date
    }
  >()
  let firstCommitDate: Date | undefined = undefined
  let lastCommitDate: Date | undefined = undefined

  const stdout = await new Promise<string>((resolve, reject) => {
    exec(
      `git log --all --follow --format="%aN|%aE|%cD" -- "${filePath}"`,
      (error, stdout) => {
        if (error) {
          reject(error)
        } else {
          resolve(stdout.toString().trim())
        }
      }
    )
  })
  const lines = stdout.split('\n').filter(Boolean)

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex]
    const [name, email, dateString] = line.split('|')
    const date = new Date(dateString)

    if (!authorContributions.has(email)) {
      authorContributions.set(email, {
        name,
        commitCount: 1,
        firstCommitDate: date,
        lastCommitDate: date,
      })
    } else {
      const author = authorContributions.get(email)!
      author.commitCount += 1
      if (author.firstCommitDate > date) {
        author.firstCommitDate = date
      }
      if (author.lastCommitDate < date) {
        author.lastCommitDate = date
      }
    }

    if (firstCommitDate === undefined || date < firstCommitDate) {
      firstCommitDate = date
    }
    if (lastCommitDate === undefined || date > lastCommitDate) {
      lastCommitDate = date
    }
  }

  const sortedAuthors = Array.from(authorContributions.values()).sort(
    (a, b) =>
      b.commitCount - a.commitCount ||
      b.lastCommitDate.getTime() - a.lastCommitDate.getTime()
  )

  const result = {
    authors: sortedAuthors,
    firstCommitDate,
    lastCommitDate,
  } satisfies GitMetadata

  cache.set(filePath, result)

  return result
}
