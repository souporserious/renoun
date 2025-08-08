import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join } from 'node:path'
import {
  stickyMarker,
  ensureEnv,
  getRepoContext,
  sh,
  runCommands,
  ensureGitIdentity,
  assertSafePreviewBranch,
  getGithubRemoteUrl,
  assertSafeWorkdir,
  safeReinitGitRepo,
  buildPreviewCommentBody,
} from './utils.js'

ensureEnv(['GITHUB_REPOSITORY', 'GH_TOKEN'])
const { owner, repo, repoFlag } = getRepoContext()
const GH_TOKEN = String(process.env.GH_TOKEN || '')

const manifestPath = join(process.cwd(), 'previews', 'manifest.json')
if (!existsSync(manifestPath)) {
  console.log('No manifest.json found — skipping comment creation')
  process.exit(0)
}

/** @type {import('./utils.js').PreviewManifest} */
const data = JSON.parse(readFileSync(manifestPath, 'utf8'))
const previewBranch = data.branch || 'package-preview'
if (!/^[A-Za-z0-9._\/-]+$/.test(previewBranch)) {
  console.error('Invalid preview branch in manifest; aborting comment step')
  process.exit(1)
}
assertSafePreviewBranch(previewBranch, owner, repo)
const prNumber = data.pr
if (!prNumber || !Number.isInteger(Number(prNumber))) {
  console.error('Invalid or missing PR number in manifest.json')
  process.exit(1)
}

const marker = stickyMarker
const body = buildPreviewCommentBody(marker, data.assets || [])

// Prepare a working copy of the preview branch to persist comment id
const workdir = join(process.cwd(), '.preview-comment')
assertSafeWorkdir(workdir)
mkdirSync(workdir, { recursive: true })
sh('git init', { cwd: workdir })
const remoteUrl = getGithubRemoteUrl(owner, repo, GH_TOKEN)
sh(`git remote add origin ${remoteUrl}`, { cwd: workdir })
let branchExists = false
try {
  const heads = sh(`git ls-remote --heads origin ${previewBranch}`)
  branchExists = (heads?.trim().length ?? 0) > 0
} catch (_) {}
if (branchExists) {
  sh(`git fetch --depth=1 origin ${previewBranch}`, { cwd: workdir })
  sh(`git checkout -b ${previewBranch} origin/${previewBranch}`, {
    cwd: workdir,
  })
} else {
  // Should not happen because create step pushed it, but be resilient
  sh(`git checkout -b ${previewBranch}`, { cwd: workdir })
}

// If we have a previously persisted comment id, update directly
let existingId = data.commentId || null
if (!existingId) {
  try {
    /** @type {{ id?: number }} */
    const idData = JSON.parse(
      readFileSync(join(workdir, '.comments', `pr-${prNumber}.json`), 'utf8')
    )
    if (idData?.id) existingId = Number(idData.id)
  } catch (_) {}
}

// We intentionally avoid listing all comments when we have no id; we'll create a new one and persist its id

if (existingId) {
  const patchCmd = `gh api ${repoFlag} repos/${owner}/${repo}/issues/comments/${existingId} --method PATCH --input -`
  execSync(patchCmd, { input: JSON.stringify({ body }), encoding: 'utf8' })
  console.log(`Updated sticky comment ${existingId}`)
} else {
  const postCmd = `gh api ${repoFlag} repos/${owner}/${repo}/issues/${data.pr}/comments --method POST --input -`
  /** @type {{ id: number }} */
  const created = JSON.parse(
    execSync(postCmd, { input: JSON.stringify({ body }), encoding: 'utf8' })
  )
  console.log('Created sticky comment')
  existingId = created.id
}

// Persist the comment id to the preview branch (single-commit force push)
try {
  mkdirSync(join(workdir, '.comments'), { recursive: true })
  writeFileSync(
    join(workdir, '.comments', `pr-${prNumber}.json`),
    JSON.stringify({ id: existingId }, null, 2)
  )
  // Re-init to keep history as a single commit
  safeReinitGitRepo(workdir, previewBranch, remoteUrl, { owner, repo })
  ensureGitIdentity(workdir)
  runCommands(
    [
      'git add -A',
      `git commit -m "update PR #${prNumber} [skip ci]"`,
      `git push -f origin ${previewBranch}`,
    ],
    { cwd: workdir }
  )
  console.log('Persisted comment id to preview branch')
} catch (err) {
  console.warn(
    'Failed to persist comment id to preview branch:',
    err?.message || err
  )
}
