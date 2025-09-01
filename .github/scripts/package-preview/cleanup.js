import { mkdirSync, rmSync, existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  sh,
  runCommands,
  ensureGitIdentity,
  getRepoContext,
  assertSafePreviewBranch,
  getGithubRemoteUrl,
  assertSafeWorkdir,
  safeReinitGitRepo,
  deleteStickyComments,
  gh,
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

const PREVIEW_BRANCH = process.env.PREVIEW_BRANCH || 'package-preview'
if (!/^[A-Za-z0-9._\/-]+$/.test(PREVIEW_BRANCH)) {
  console.error(
    'Invalid PREVIEW_BRANCH; only alphanumerics, . _ - and / are allowed'
  )
  process.exit(1)
}
let defaultBranch = ''
try {
  const data = await gh(
    GH_TOKEN,
    'GET',
    `https://api.github.com/repos/${owner}/${repo}`
  )
  defaultBranch = String(data?.default_branch || '')
} catch {
  defaultBranch = ''
}
assertSafePreviewBranch(PREVIEW_BRANCH, defaultBranch)

// Optional root directory placeholder to keep the branch non-empty when a PR's
// directory was the only content left. Mirrors logic in create.js.
const ROOT_DIRECTORY = String(process.env.ROOT_DIRECTORY || '').trim()
function isSafeRelativeDir(p) {
  return (
    p !== '' &&
    /^[A-Za-z0-9._\/-]+$/.test(p) &&
    !p.startsWith('/') &&
    !p.includes('..') &&
    !p.endsWith('/')
  )
}

// Prepare a working dir and fetch current preview branch state
const workingDirectory = join(process.cwd(), '.preview-cleanup')
assertSafeWorkdir(workingDirectory)
if (existsSync(workingDirectory)) {
  rmSync(workingDirectory, { recursive: true, force: true })
}
mkdirSync(workingDirectory, { recursive: true })
const remoteUrl = getGithubRemoteUrl(owner, repo, GH_TOKEN)
sh('git init', { cwd: workingDirectory })
sh(`git remote add origin ${remoteUrl}`, { cwd: workingDirectory })

let branchExists = false
try {
  const heads = sh(`git ls-remote --heads origin ${PREVIEW_BRANCH}`, {
    cwd: workingDirectory,
  })
  branchExists = (heads?.trim().length ?? 0) > 0
} catch {
  // Ignore
}

if (!branchExists) {
  console.log('Preview branch not found — nothing to clean')
  await deleteStickyComments(GH_TOKEN, owner, repo, PR_NUMBER)
  process.exit(0)
}

sh(`git fetch --depth=1 origin ${PREVIEW_BRANCH}`, { cwd: workingDirectory })
sh(`git checkout -b ${PREVIEW_BRANCH} origin/${PREVIEW_BRANCH}`, {
  cwd: workingDirectory,
})

// Remove the PR directory and persist as a single commit
rmSync(join(workingDirectory, PR_NUMBER), { recursive: true, force: true })
sh(`git add -A`, { cwd: workingDirectory })
// If nothing changed, exit early
try {
  const status = sh('git status --porcelain', { cwd: workingDirectory })
  if (!status) {
    console.log('No preview assets to remove for this PR')
    await deleteStickyComments(GH_TOKEN, owner, repo, PR_NUMBER)
    process.exit(0)
  }
} catch {
  // Ignore
}

// Re-init to keep single-commit history
safeReinitGitRepo(workingDirectory, PREVIEW_BRANCH, remoteUrl, {
  owner,
  repo,
  defaultBranch,
})
ensureGitIdentity(workingDirectory)
// Ensure ROOT_DIRECTORY placeholder exists if configured
if (ROOT_DIRECTORY && isSafeRelativeDir(ROOT_DIRECTORY)) {
  const rootDirPath = join(workingDirectory, ROOT_DIRECTORY)
  if (!existsSync(rootDirPath)) {
    mkdirSync(rootDirPath, { recursive: true })
  }
  const keep = join(rootDirPath, '.gitkeep')
  if (!existsSync(keep)) {
    writeFileSync(keep, '')
  }
}

// Stage changes and decide whether to allow an empty commit
sh('git add -A', { cwd: workingDirectory })
let commitCmd = `git commit -m "remove ${PR_NUMBER} [skip ci]"`
try {
  const statusAfterAdd = sh('git status --porcelain', { cwd: workingDirectory })
  if (!statusAfterAdd) {
    // No file changes to commit; create an empty commit so the branch history advances
    commitCmd = `git commit --allow-empty -m "remove ${PR_NUMBER} [skip ci]"`
  }
} catch {
  // Fall through to normal commit
}
runCommands([commitCmd, `git push -f origin ${PREVIEW_BRANCH}`], {
  cwd: workingDirectory,
})

console.log(
  `Removed preview assets for PR #${PR_NUMBER} and force-pushed ${PREVIEW_BRANCH}`
)

await deleteStickyComments(GH_TOKEN, owner, repo, PR_NUMBER)
