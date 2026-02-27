import { describe, expect, it, vi } from 'vitest'

import {
  getWorkspaceChangeTokenFromGit,
  getWorkspaceChangedPathsSinceTokenFromGit,
} from './workspace-change-git.ts'
import { createWorkspaceChangeToken } from './workspace-change-token.ts'

describe('workspace-change-git hardening', () => {
  it('returns null when rev-parse returns a non-commit head', async () => {
    const runGit = vi.fn(async (args: string[]) => {
      if (args[0] === 'rev-parse') {
        return {
          status: 0,
          stdout: '--output=/tmp/pwn\n',
          stderr: '',
        }
      }

      throw new Error(`Unexpected git command: ${args.join(' ')}`)
    })

    const token = await getWorkspaceChangeTokenFromGit({
      statusScope: '.',
      includeIgnoredStatuses: false,
      runGit,
      getPathSignature: async () => 'sig',
    })

    expect(token).toBeNull()
    expect(runGit).toHaveBeenCalledTimes(1)
  })

  it('rejects invalid previous heads before running git commands', async () => {
    const runGit = vi.fn(async () => ({
      status: 0,
      stdout: '',
      stderr: '',
    }))

    const changedPaths = await getWorkspaceChangedPathsSinceTokenFromGit({
      previousToken: 'head:--output=/tmp/pwn;dirty:a;count:0;ignored-only:0',
      statusScope: '.',
      includeIgnoredStatuses: false,
      runGit,
      getPathSignature: async () => 'sig',
      toWorkspacePath: (path) => path,
    })

    expect(changedPaths).toBeNull()
    expect(runGit).not.toHaveBeenCalled()
  })

  it('returns null when current rev-parse head is invalid', async () => {
    const previousToken = createWorkspaceChangeToken({
      headCommit: 'a'.repeat(40),
      statusDigest: {
        digest: 'digest',
        ignoredOnly: false,
        count: 0,
      },
    })
    const runGit = vi.fn(async (args: string[]) => {
      if (args[0] === 'rev-parse') {
        return {
          status: 0,
          stdout: '--output=/tmp/pwn\n',
          stderr: '',
        }
      }

      throw new Error(`Unexpected git command: ${args.join(' ')}`)
    })

    const changedPaths = await getWorkspaceChangedPathsSinceTokenFromGit({
      previousToken,
      statusScope: '.',
      includeIgnoredStatuses: false,
      runGit,
      getPathSignature: async () => 'sig',
      toWorkspacePath: (path) => path,
    })

    expect(changedPaths).toBeNull()
    expect(runGit).toHaveBeenCalledTimes(1)
  })

  it('returns null when dirty digest drifts on the same head', async () => {
    const headCommit = 'a'.repeat(40)
    const previousToken = createWorkspaceChangeToken({
      headCommit,
      statusDigest: {
        digest: 'previous-dirty',
        ignoredOnly: false,
        count: 1,
      },
    })
    const runGit = vi.fn(async (args: string[]) => {
      if (args[0] === 'rev-parse') {
        return {
          status: 0,
          stdout: `${headCommit}\n`,
          stderr: '',
        }
      }

      if (args[0] === 'status') {
        return {
          status: 0,
          stdout: '',
          stderr: '',
        }
      }

      throw new Error(`Unexpected git command: ${args.join(' ')}`)
    })

    const changedPaths = await getWorkspaceChangedPathsSinceTokenFromGit({
      previousToken,
      statusScope: '.',
      includeIgnoredStatuses: false,
      runGit,
      getPathSignature: async () => 'sig',
      toWorkspacePath: (path) => path,
    })

    expect(changedPaths).toBeNull()
    expect(runGit).toHaveBeenCalledTimes(2)
  })
})
