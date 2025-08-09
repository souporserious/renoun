import { execSync } from 'node:child_process'
import { mkdirSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { Octokit } from '@octokit/rest'

import {
  stickyMarker,
  runCommands,
  ensureGitIdentity,
  getRepoContext,
  assertSafePreviewBranch,
  getGithubRemoteUrl,
  assertSafeWorkdir,
  safeReinitGitRepo,
} from './utils.js'

const PR_NUMBER = String(process.env.PR_NUMBER || '')
const GH_TOKEN = String(process.env.GH_TOKEN || '')
if (!PR_NUMBER || !GH_TOKEN) {
  console.error('PR_NUMBER and GH_TOKEN are required')
  process.exit(1)
}
// Validate PR_NUMBER to avoid any possibility of shell/path injection
if (!/^\d+$/.test(PR_NUMBER)) {
  console.error('Invalid PR_NUMBER; expected digits only')
  process.exit(1)
}
const { owner, repo } = getRepoContext()
const octokit = new Octokit({ auth: GH_TOKEN })

/**
 * @param {string} cmd
 * @typedef {Omit<import('node:child_process').ExecSyncOptionsWithStringEncoding, 'encoding'> & { encoding?: 'utf8' }} ExecOpts
 * @param {ExecOpts} [opts]
 * @returns {string}
 */
const sh = (cmd, opts = {}) => {
  /** @type {import('node:child_process').ExecSyncOptionsWithStringEncoding} */
  const options = { stdio: 'pipe', encoding: 'utf8', ...(opts || {}) }
  return execSync(cmd, options).trim()
}

const PREVIEW_BRANCH = process.env.PREVIEW_BRANCH || 'package-preview'
if (!/^[A-Za-z0-9._\/-]+$/.test(PREVIEW_BRANCH)) {
  console.error(
    'Invalid PREVIEW_BRANCH; only alphanumerics, . _ - and / are allowed'
  )
  process.exit(1)
}
let defaultBranch = ''
try {
  const { data } = await octokit.rest.repos.get({ owner, repo })
  defaultBranch = String(data?.default_branch || '')
} catch (_) {
  defaultBranch = ''
}
assertSafePreviewBranch(PREVIEW_BRANCH, defaultBranch)

// Prepare a working dir and fetch current preview branch state
const workdir = join(process.cwd(), '.preview-cleanup')
assertSafeWorkdir(workdir)
if (existsSync(workdir)) rmSync(workdir, { recursive: true, force: true })
mkdirSync(workdir, { recursive: true })
const remoteUrl = getGithubRemoteUrl(owner, repo, GH_TOKEN)
sh('git init', { cwd: workdir })
sh(`git remote add origin ${remoteUrl}`, { cwd: workdir })

let branchExists = false
try {
  const heads = sh(`git ls-remote --heads origin ${PREVIEW_BRANCH}`)
  branchExists = (heads?.trim().length ?? 0) > 0
} catch (_) {}

if (!branchExists) {
  console.log('Preview branch not found — nothing to clean')
  process.exit(0)
}

sh(`git fetch --depth=1 origin ${PREVIEW_BRANCH}`, { cwd: workdir })
sh(`git checkout -b ${PREVIEW_BRANCH} origin/${PREVIEW_BRANCH}`, {
  cwd: workdir,
})

// Remove the PR directory and persist as a single commit
rmSync(join(workdir, PR_NUMBER), { recursive: true, force: true })
sh(`git add -A`, { cwd: workdir })
// If nothing changed, exit early
try {
  const status = sh('git status --porcelain', { cwd: workdir })
  if (!status) {
    console.log('No preview assets to remove for this PR')
    process.exit(0)
  }
} catch (_) {}

// Re-init to keep single-commit history
safeReinitGitRepo(workdir, PREVIEW_BRANCH, remoteUrl, {
  owner,
  repo,
  defaultBranch,
})
ensureGitIdentity(workdir)
runCommands(
  [
    'git add -A',
    `git commit -m "remove #${PR_NUMBER} [skip ci]"`,
    `git push -f origin ${PREVIEW_BRANCH}`,
  ],
  { cwd: workdir }
)

console.log(
  `Removed preview assets for PR #${PR_NUMBER} and force-pushed ${PREVIEW_BRANCH}`
)

// Best-effort: delete the sticky PR comment(s) via Octokit
try {
  const { data: comments } = await octokit.rest.issues.listComments({
    owner,
    repo,
    issue_number: Number(PR_NUMBER),
    per_page: 100,
  })
  for (const comment of comments) {
    if (
      typeof comment?.body === 'string' &&
      comment.body.includes(stickyMarker)
    ) {
      try {
        await octokit.rest.issues.deleteComment({
          owner,
          repo,
          comment_id: Number(comment.id),
        })
        console.log(`Deleted preview comment ${comment.id}`)
      } catch (err) {
        console.warn(
          `Failed to delete comment ${comment.id}:`,
          err?.message || err
        )
      }
    }
  }
} catch (err) {
  console.warn(
    'Failed to enumerate/delete sticky comments:',
    err?.message || err
  )
}
