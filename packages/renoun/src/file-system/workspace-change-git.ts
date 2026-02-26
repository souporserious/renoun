import { normalizePathKey, normalizeSlashes } from '../utils/path.ts'
import {
  parseGitStatusPorcelainV1Z,
  parseNullTerminatedGitPathList,
} from './git-status.ts'
import type { SpawnResult } from './spawn.ts'
import {
  createWorkspaceChangeToken,
  createWorkspaceStatusDigest,
  extractDirtyDigestFromWorkspaceToken,
  extractHeadFromWorkspaceToken,
  isWorkspaceHeadCommit,
} from './workspace-change-token.ts'

type RunGit = (args: string[]) => Promise<SpawnResult>

interface WorkspaceStatusLookupOptions {
  statusScope: string
  includeIgnoredStatuses: boolean
  runGit: RunGit
  getPathSignature: (relativePath: string) => Promise<string>
}

interface WorkspaceChangedPathsLookupOptions
  extends WorkspaceStatusLookupOptions {
  previousToken: string
  toWorkspacePath: (repoRelativePath: string) => string
}

function createGitStatusArguments(
  statusScope: string,
  includeIgnoredStatuses: boolean
): string[] {
  return [
    'status',
    '--porcelain=1',
    '-z',
    '--untracked-files=all',
    ...(includeIgnoredStatuses ? ['--ignored=matching'] : []),
    '--ignore-submodules=all',
    '--',
    statusScope,
  ]
}

export async function shouldIncludeIgnoredStatusForScope(options: {
  statusScope: string
  runGit: RunGit
}): Promise<boolean> {
  if (options.statusScope === '.') {
    return false
  }

  const ignoredResult = await options.runGit([
    'check-ignore',
    '-q',
    '--',
    options.statusScope,
  ])
  return ignoredResult.status === 0
}

export async function getWorkspaceChangeTokenFromGit(
  options: WorkspaceStatusLookupOptions
): Promise<string | null> {
  const headResult = await options.runGit(['rev-parse', 'HEAD'])
  if (headResult.status !== 0) {
    return null
  }

  const headCommit = headResult.stdout.trim()
  if (!headCommit || !isWorkspaceHeadCommit(headCommit)) {
    return null
  }

  const statusResult = await options.runGit(
    createGitStatusArguments(
      options.statusScope,
      options.includeIgnoredStatuses
    )
  )
  if (statusResult.status !== 0) {
    return null
  }

  const statusEntries = parseGitStatusPorcelainV1Z(statusResult.stdout)
  const statusDigest = await createWorkspaceStatusDigest({
    entries: statusEntries,
    getPathSignature: options.getPathSignature,
  })

  return createWorkspaceChangeToken({
    headCommit,
    statusDigest,
  })
}

export async function getWorkspaceChangedPathsSinceTokenFromGit(
  options: WorkspaceChangedPathsLookupOptions
): Promise<readonly string[] | null> {
  const previousHead = extractHeadFromWorkspaceToken(options.previousToken)
  if (!previousHead) {
    return null
  }
  const previousDirtyDigest = extractDirtyDigestFromWorkspaceToken(
    options.previousToken
  )

  const headResult = await options.runGit(['rev-parse', 'HEAD'])
  if (headResult.status !== 0) {
    return null
  }

  const currentHead = headResult.stdout.trim()
  if (!currentHead || !isWorkspaceHeadCommit(currentHead)) {
    return null
  }

  const changedPaths = new Set<string>()
  const diffResultPromise =
    currentHead !== previousHead
      ? options.runGit([
          'diff',
          '--name-only',
          '--no-renames',
          '-z',
          `${previousHead}..${currentHead}`,
          '--',
          options.statusScope,
        ])
      : Promise.resolve<SpawnResult | null>(null)
  const statusResultPromise = options.runGit(
    createGitStatusArguments(options.statusScope, options.includeIgnoredStatuses)
  )
  const [statusResult, diffResult] = await Promise.all([
    statusResultPromise,
    diffResultPromise,
  ])

  if (statusResult.status !== 0) {
    return null
  }

  if (currentHead !== previousHead) {
    if (!diffResult || diffResult.status !== 0) {
      return null
    }

    const diffPaths = parseNullTerminatedGitPathList(diffResult.stdout)
      .map((line) => normalizeSlashes(line))
      .filter((line) => line.length > 0)

    for (const diffPath of diffPaths) {
      changedPaths.add(diffPath)
    }
  }

  const statusEntries = parseGitStatusPorcelainV1Z(statusResult.stdout)
  const statusDigest = await createWorkspaceStatusDigest({
    entries: statusEntries,
    getPathSignature: options.getPathSignature,
  })

  if (currentHead === previousHead && previousDirtyDigest === statusDigest.digest) {
    return []
  }

  for (const statusEntry of statusEntries) {
    for (const statusPath of statusEntry.paths) {
      const normalizedStatusPath = normalizeSlashes(statusPath)
      if (normalizedStatusPath.length > 0) {
        changedPaths.add(normalizedStatusPath)
      }
    }
  }

  return Array.from(changedPaths)
    .map((path) => normalizePathKey(options.toWorkspacePath(path)))
    .filter((path) => path.length > 0)
    .sort((first, second) => first.localeCompare(second))
}
