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
const { owner, repo } = getRepoContext()
const octokit = new Octokit({ auth: String(process.env.GH_TOKEN) })

const manifestPath = join(process.cwd(), 'previews', 'manifest.json')
if (!existsSync(manifestPath)) {
  console.log('No manifest.json found — skipping comment creation')
  process.exit(0)
}

/** @type {import('./utils.js').PreviewManifest} */
const data = JSON.parse(readFileSync(manifestPath, 'utf8'))
const prNumber = data.pr
if (!prNumber || !Number.isInteger(Number(prNumber))) {
  console.error('Invalid or missing PR number in manifest.json')
  process.exit(1)
}

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
