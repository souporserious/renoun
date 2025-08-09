import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Octokit } from '@octokit/rest'

import {
  stickyMarker,
  ensureEnv,
  getRepoContext,
  buildPreviewCommentBody,
} from './utils.js'

ensureEnv(['GITHUB_REPOSITORY', 'GH_TOKEN'])
// Validate PR_NUMBER from the event environment to prevent cross-PR posting
const PR_NUMBER = Number(process.env.PR_NUMBER || 0)
if (!Number.isInteger(PR_NUMBER) || PR_NUMBER <= 0) {
  console.error('PR_NUMBER env is required and must be a positive integer')
  process.exit(1)
}
const { owner, repo } = getRepoContext()
const octokit = new Octokit({ auth: String(process.env.GH_TOKEN) })

const manifestPath = join(process.cwd(), 'previews', 'manifest.json')
if (!existsSync(manifestPath)) {
  console.log('No manifest.json found — skipping comment creation')
  process.exit(0)
}

/** @type {import('./utils.js').PreviewManifest} */
const data = JSON.parse(readFileSync(manifestPath, 'utf8'))
const manifestPr = Number(data.pr)
if (!Number.isInteger(manifestPr) || manifestPr <= 0) {
  console.error('Invalid or missing PR number in manifest.json')
  process.exit(1)
}
if (manifestPr !== PR_NUMBER) {
  console.error(
    `Manifest PR ("${manifestPr}") does not match event PR ("${PR_NUMBER}")`
  )
  process.exit(1)
}
const prNumber = PR_NUMBER

const marker = stickyMarker
const body = buildPreviewCommentBody(marker, data.assets || [])

// Upsert sticky comment by searching existing PR comments
let existingId = null
try {
  const { data: comments } = await octokit.rest.issues.listComments({
    owner,
    repo,
    issue_number: Number(prNumber),
    per_page: 100,
  })
  const existing = comments.find((comment) => comment?.body?.includes?.(marker))
  if (existing?.id) {
    existingId = existing.id
  }
} catch (error) {
  console.warn('Failed to list PR comments:', error?.message || error)
}

if (existingId) {
  await octokit.rest.issues.updateComment({
    owner,
    repo,
    comment_id: Number(existingId),
    body,
  })
  console.log(`Updated sticky comment ${existingId}`)
} else {
  await octokit.rest.issues.createComment({
    owner,
    repo,
    issue_number: Number(prNumber),
    body,
  })
}
