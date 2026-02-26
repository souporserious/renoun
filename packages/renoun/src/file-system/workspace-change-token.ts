import { createHash } from 'node:crypto'

import { normalizeSlashes } from '../utils/path.ts'
import type { GitStatusPorcelainEntry } from './git-status.ts'

export const WORKSPACE_TOKEN_UNTRUSTED_IGNORED_ONLY_MARKER = ';ignored-only:1'
export const WORKSPACE_TOKEN_UNTRUSTED_INCLUDE_GIT_IGNORED_MARKER =
  ';include-gitignored:1'
const WORKSPACE_HEAD_COMMIT_RE = /^[0-9a-fA-F]{7,64}$/

export interface WorkspaceStatusDigest {
  digest: string
  ignoredOnly: boolean
  count: number
}

export function createWorkspaceChangeToken(options: {
  headCommit: string
  statusDigest: WorkspaceStatusDigest
}): string {
  const { headCommit, statusDigest } = options

  return `head:${headCommit};dirty:${statusDigest.digest};count:${statusDigest.count};ignored-only:${statusDigest.ignoredOnly ? 1 : 0}`
}

export function extractHeadFromWorkspaceToken(token: string): string | null {
  const match = /^head:([^;]+);/.exec(token)
  const head = match?.[1]
  if (!head) {
    return null
  }

  return isWorkspaceHeadCommit(head) ? head : null
}

export function extractDirtyDigestFromWorkspaceToken(token: string): string | null {
  const match = /;dirty:([^;]+);/.exec(token)
  return match?.[1] ?? null
}

export function markWorkspaceTokenForGitIgnoredSnapshots(
  token: string | null | undefined
): string | null {
  if (!token) {
    return null
  }

  if (token.includes(WORKSPACE_TOKEN_UNTRUSTED_INCLUDE_GIT_IGNORED_MARKER)) {
    return token
  }

  return `${token}${WORKSPACE_TOKEN_UNTRUSTED_INCLUDE_GIT_IGNORED_MARKER}`
}

export function isTrustedWorkspaceChangeToken(
  token: string | null | undefined
): token is string {
  if (!token) {
    return false
  }

  return (
    !token.includes(WORKSPACE_TOKEN_UNTRUSTED_IGNORED_ONLY_MARKER) &&
    !token.includes(WORKSPACE_TOKEN_UNTRUSTED_INCLUDE_GIT_IGNORED_MARKER)
  )
}

export function isWorkspaceHeadCommit(value: string): boolean {
  return WORKSPACE_HEAD_COMMIT_RE.test(value)
}

export async function createWorkspaceStatusDigest(options: {
  entries: ReadonlyArray<GitStatusPorcelainEntry>
  getPathSignature: (normalizedRelativePath: string) => Promise<string>
}): Promise<WorkspaceStatusDigest> {
  const pathSignatureCache = new Map<string, Promise<string>>()
  const digestLines = await Promise.all(
    options.entries.map(async (entry) => {
      const normalizedPaths = entry.paths.map((path) => normalizeSlashes(path))
      const signatures = await Promise.all(
        normalizedPaths.map((path) => {
          const cachedSignature = pathSignatureCache.get(path)
          if (cachedSignature) {
            return cachedSignature
          }

          const signaturePromise = options.getPathSignature(path)
          pathSignatureCache.set(path, signaturePromise)
          return signaturePromise
        })
      )

      return `${entry.status} ${normalizedPaths.join('\u0001')} ${signatures.join('\u0001')}`
    })
  )

  digestLines.sort((first, second) => first.localeCompare(second))

  const ignoredOnly =
    options.entries.length > 0 &&
    options.entries.every((entry) => entry.status === '!!')

  const digest = createHash('sha1').update(digestLines.join('\n')).digest('hex')

  return {
    digest,
    ignoredOnly,
    count: options.entries.length,
  }
}
