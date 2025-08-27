import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { stickyMarker, getRepoContext } from './utils.js'

/**
 * @typedef {{ name: string, url: string }} PreviewAsset
 * @typedef {{ branch: string, short: string, pr: number, assets: PreviewAsset[], targets: string[] }} PreviewManifest
 */

/**
 * Ensure required environment variables exist.
 * @param {string[]} vars
 */
function ensureEnv(vars) {
  const missing = vars.filter((v) => !process.env[v])
  if (missing.length) {
    console.error(`Missing required env vars: ${missing.join(', ')}`)
    process.exit(1)
  }
}

ensureEnv(['GITHUB_REPOSITORY', 'GITHUB_EVENT_PATH', 'GH_TOKEN'])

const githubToken = String(process.env.GH_TOKEN)
const { owner, repo } = getRepoContext()

/** @type {{ pull_request?: { number?: number } }} */
const event = JSON.parse(
  readFileSync(String(process.env.GITHUB_EVENT_PATH), 'utf8')
)
const prNumber = Number(event?.pull_request?.number || 0)
if (!Number.isInteger(prNumber) || prNumber <= 0) {
  console.error('Could not resolve PR number from event payload')
  process.exit(1)
}

// Read manifest produced by the create step
const manifestPath = join(process.cwd(), 'previews', 'manifest.json')
if (!existsSync(manifestPath)) {
  console.log('No manifest.json found — skipping comment creation')
  process.exit(0)
}

/** @type {PreviewManifest} */
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
if (!Number.isInteger(manifest?.pr) || Number(manifest.pr) !== prNumber) {
  console.error(
    `Manifest PR (${manifest?.pr}) does not match event PR (${prNumber})`
  )
  process.exit(1)
}

/** @type {PreviewAsset[]} */
const assets = Array.isArray(manifest.assets) ? manifest.assets : []

/**
 * REST helper
 * @param {string} method
 * @param {string} url
 * @param {any} [body]
 */
async function gh(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `token ${githubToken}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(
      `${method} ${url} -> ${res.status} ${res.statusText} ${text}`
    )
  }
  if (res.status === 204) return null
  return res.json()
}

/**
 * Get existing sticky comment, if any.
 */
async function getExistingComment() {
  const url = `https://api.github.com/repos/${owner}/${repo}/issues/${prNumber}/comments?per_page=100`
  /** @type {{ id: number, body?: string, user?: { type: string, login: string } }[]} */
  const comments = await gh('GET', url)
  return (
    comments.find(
      (comment) =>
        typeof comment?.body === 'string' &&
        comment.body.includes(stickyMarker) &&
        comment?.user?.type === 'Bot' &&
        comment?.user?.login === 'github-actions[bot]'
    ) || null
  )
}

if (assets.length === 0) {
  // No preview assets — remove any sticky comment and exit
  try {
    const existing = await getExistingComment()
    if (existing) {
      const delUrl = `https://api.github.com/repos/${owner}/${repo}/issues/comments/${existing.id}`
      await gh('DELETE', delUrl)
    }
  } catch (err) {
    console.warn(
      'Failed to delete existing sticky comment:',
      err?.message || err
    )
  }
  process.exit(0)
}

// Map top-level changed packages (manifest.targets) to their tarball URLs in assets.
const tarballPrefix = (packageName) => {
  return packageName.replace(/^@/, '').replace('/', '-') + '-'
}
const urlForTarget = (name) => {
  const prefix = tarballPrefix(name)
  const asset = assets.find(
    (asset) => typeof asset.name === 'string' && asset.name.startsWith(prefix)
  )
  return asset?.url
}
const topTargets = Array.isArray(manifest.targets) ? manifest.targets : []
let urls = topTargets.map(urlForTarget).filter(Boolean)
if (urls.length === 0) {
  urls = assets.map((asset) =>
    new URL(asset.url, 'https://raw.githubusercontent.com').toString()
  )
}

const header = '### 📦 Preview packages'
const command = `npm install ${urls.map((url) => `"${url}"`).join(' ')}`
const body = [stickyMarker, header, '', '```bash', command, '```'].join('\n')

// Create or update the sticky comment
const existing = await getExistingComment()
if (existing) {
  const url = `https://api.github.com/repos/${owner}/${repo}/issues/comments/${existing.id}`
  await gh('PATCH', url, { body })
} else {
  const url = `https://api.github.com/repos/${owner}/${repo}/issues/${prNumber}/comments`
  await gh('POST', url, { body })
}

console.log('Updated sticky preview comment')
