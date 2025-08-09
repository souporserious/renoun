import {
  existsSync,
  mkdirSync,
  readdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  cpSync,
} from 'node:fs'
import { join } from 'node:path'
import { Octokit } from '@octokit/rest'

import {
  ensureEnv,
  getRepoContext,
  sh,
  ensureGitIdentity,
  runCommands,
  assertSafePreviewBranch,
  getGithubRemoteUrl,
  assertSafeWorkdir,
  safeReinitGitRepo,
  parsePnpmWorkspaces,
  parseTurboDryRunPackages,
  computePublishableTargets,
  renamePackedFilenames,
  buildRawBaseUrl,
  buildAssets,
  buildManifest,
  assertSafePackageName,
} from './utils.js'

ensureEnv(['GITHUB_REPOSITORY', 'GITHUB_SHA', 'GH_TOKEN', 'GITHUB_EVENT_PATH'])

const gitSha = String(process.env.GITHUB_SHA || '')
const eventPath = String(process.env.GITHUB_EVENT_PATH || '')
const GH_TOKEN = String(process.env.GH_TOKEN || '')

/** @type {any} */
const event = JSON.parse(readFileSync(eventPath, 'utf8'))
const prNumber = event.pull_request?.number
let baseSha = event.pull_request?.base?.sha ?? null
let headSha = String(event.pull_request?.head?.sha || gitSha)
if (!prNumber) {
  console.error('Could not resolve PR number from event payload')
  process.exit(1)
}
// Validate PR number to be strictly numeric
if (!/^\d+$/.test(String(prNumber))) {
  console.error('Invalid PR number in event payload; expected digits only')
  process.exit(1)
}

const PREVIEW_BRANCH = process.env.PREVIEW_BRANCH || 'package-preview'
if (!/^[A-Za-z0-9._\/-]+$/.test(PREVIEW_BRANCH)) {
  console.error(
    'Invalid PREVIEW_BRANCH; only alphanumerics, . _ - and / are allowed'
  )
  process.exit(1)
}
if (baseSha && !/^[a-fA-F0-9]{7,40}$/.test(String(baseSha))) {
  console.warn(
    'Invalid base SHA in event payload; ignoring Turbo affected detection'
  )
  baseSha = null
}
// Validate head SHA and fall back to GITHUB_SHA if necessary
if (!/^[a-fA-F0-9]{7,40}$/.test(String(headSha))) {
  console.warn(
    'Invalid head SHA in event payload; falling back to GITHUB_SHA if valid'
  )
  headSha = /^[a-fA-F0-9]{7,40}$/.test(String(gitSha))
    ? String(gitSha)
    : '0000000'
}
const { owner, repo } = getRepoContext()
const octokit = new Octokit({ auth: GH_TOKEN })
let repoDefaultBranch = ''
try {
  const { data } = await octokit.rest.repos.get({ owner, repo })
  repoDefaultBranch = String(data?.default_branch || '')
} catch (_) {
  repoDefaultBranch = ''
}
assertSafePreviewBranch(PREVIEW_BRANCH, repoDefaultBranch)
const sha = headSha.slice(0, 7)
const previewsDirectory = join(process.cwd(), 'previews')

if (!existsSync(previewsDirectory)) {
  mkdirSync(previewsDirectory, { recursive: true })
}

/**
 * Read workspace list from pnpm and normalize shape.
 * @returns {import('./utils.js').Workspace[]}
 */
function getWorkspaces() {
  const json = sh('pnpm -r list --depth -1 --json')
  return parsePnpmWorkspaces(json)
}

/**
 * @template T
 * @param {T[]} arr
 * @returns {T[]}
 */
function uniq(arr) {
  return Array.from(new Set(arr))
}

/**
 * @param {string | null} baseSha
 * @returns {string[]}
 */
function getTurboAffectedPackages(baseSha) {
  if (!baseSha) return []
  try {
    const out = sh(`pnpm turbo run build --filter='...[${baseSha}]' --dry=json`)
    return parseTurboDryRunPackages(out)
  } catch (err) {
    console.warn(
      'Turbo affected detection failed; treating as no publishable targets:',
      err?.message || err
    )
    return []
  }
}

const workspaces = getWorkspaces()
/** @type {string[]} */
let targets = computePublishableTargets(
  workspaces,
  getTurboAffectedPackages(baseSha)
)

// If nothing is affected, then skip entirely — do not pack everything
if (targets.length === 0) {
  console.log('No publishable workspaces affected — skipping preview creation')
  process.exit(0)
}

// Ensure uniqueness just in case Turbo output included duplicates
targets = Array.from(new Set(targets))

console.log('Packing targets (Turbo affected):', targets.join(', '))

for (const name of targets) {
  // Validate package names to conservative charset before shell usage
  assertSafePackageName(name)
  // Fail on pack errors — we want CI to surface this loudly
  // Quote destination path to avoid issues with spaces or special chars
  sh(
    `pnpm -r --filter "${name}" pack --pack-destination "${previewsDirectory}"`
  )
}

// Prepare a working directory for the preview branch content
const workdir = join(process.cwd(), '.preview-branch')
assertSafeWorkdir(workdir)
if (existsSync(workdir)) rmSync(workdir, { recursive: true, force: true })
mkdirSync(workdir, { recursive: true })

// Initialize a minimal repo to retrieve existing branch contents (if any)
const remoteUrl = getGithubRemoteUrl(owner, repo, GH_TOKEN)
sh(`git init`, { cwd: workdir })
sh(`git remote add origin ${remoteUrl}`, { cwd: workdir })

let branchExists = false
try {
  const heads = sh(`git ls-remote --heads origin ${PREVIEW_BRANCH}`)
  branchExists = (heads?.trim().length ?? 0) > 0
} catch {
  branchExists = false
}

if (branchExists) {
  // Fetch and checkout existing branch content
  sh(`git fetch --depth=1 origin ${PREVIEW_BRANCH}`, { cwd: workdir })
  sh(`git checkout -b ${PREVIEW_BRANCH} origin/${PREVIEW_BRANCH}`, {
    cwd: workdir,
  })
} else {
  // Create an empty working tree for the new branch
  sh(`git checkout -b ${PREVIEW_BRANCH}`, { cwd: workdir })
}

// Remove prior PR directory (if exists) and add fresh tarballs
const prDir = join(workdir, String(prNumber))
if (existsSync(prDir)) rmSync(prDir, { recursive: true, force: true })
mkdirSync(prDir, { recursive: true })

/** @type {string[]} */
const builtFiles = readdirSync(previewsDirectory).filter((file) =>
  file.endsWith('.tgz')
)
/** @type {string[]} */
const files = []
const renamed = renamePackedFilenames(builtFiles, sha)
for (let i = 0; i < builtFiles.length; i++) {
  const src = builtFiles[i]
  const dest = renamed[i]
  cpSync(join(previewsDirectory, src), join(prDir, dest))
  files.push(dest)
}

// Re-init to ensure force-pushed single-commit history
safeReinitGitRepo(workdir, PREVIEW_BRANCH, remoteUrl, {
  owner,
  repo,
  defaultBranch: repoDefaultBranch,
})
ensureGitIdentity(workdir)
runCommands(
  [
    'git add -A',
    `git commit -m "update #${prNumber} ${sha} [skip ci]"`,
    `git push -f origin ${PREVIEW_BRANCH}`,
  ],
  { cwd: workdir }
)

// Create manifest for the commenter step
const rawBase = buildRawBaseUrl(owner, repo, PREVIEW_BRANCH, prNumber)
/** @type {{ name: string, url: string }[]} */
const assets = buildAssets(rawBase, files)
/** @type {import('./utils.js').PreviewManifest} */
const manifest = buildManifest({
  branch: PREVIEW_BRANCH,
  short: sha,
  pr: prNumber,
  assets,
  targets: uniq(targets),
})
writeFileSync(
  join(previewsDirectory, 'manifest.json'),
  JSON.stringify(manifest, null, 2)
)
console.log(
  `Prepared manifest with ${assets.length} assets and updated branch ${PREVIEW_BRANCH}`
)
