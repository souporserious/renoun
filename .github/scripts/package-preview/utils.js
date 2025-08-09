import { execSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import { basename, resolve, join } from 'node:path'

/**
 * Shared sticky marker used to identify preview comments in PRs.
 * Consumers search for this marker to update/delete the sticky comment.
 */
export const stickyMarker = '<!-- package-preview-sticky -->'

/**
 * A publishable workspace in the monorepo.
 * @typedef {Object} Workspace
 * @property {string} name
 * @property {string} dir
 * @property {boolean} private
 */

/**
 * @typedef {{ name: string, url: string }} PreviewAsset
 */

/**
 * @typedef {Object} PreviewManifest
 * @property {string} branch
 * @property {string} short
 * @property {number} pr
 * @property {PreviewAsset[]} assets
 * @property {string[]} targets
 * @property {number} [commentId]
 */

/**
 * Run a shell command and return trimmed stdout as a string.
 * @param {string} cmd
 * @typedef {Omit<import('node:child_process').ExecSyncOptionsWithStringEncoding, 'encoding'> & { encoding?: 'utf8' }} ExecOpts
 * @param {ExecOpts} [opts]
 * @returns {string}
 */
export function sh(cmd, opts = {}) {
  /** @type {import('node:child_process').ExecSyncOptionsWithStringEncoding} */
  const options = { stdio: 'pipe', encoding: 'utf8', ...(opts || {}) }
  return execSync(cmd, options).trim()
}

/**
 * Ensure required environment variables are present; exits the process otherwise.
 * @param {string[]} varNames
 * @returns {void}
 */
export function ensureEnv(varNames) {
  const missing = varNames.filter((name) => !process.env[name])
  if (missing.length > 0) {
    console.error(`Missing required env vars: ${missing.join(', ')}`)
    process.exit(1)
  }
}

/**
 * Resolve repository context from GITHUB_REPOSITORY.
 * @returns {{ owner: string, repo: string, repoFlag: string }}
 */
export function getRepoContext() {
  const { GITHUB_REPOSITORY } = process.env
  if (!GITHUB_REPOSITORY) {
    console.error('GITHUB_REPOSITORY is required')
    process.exit(1)
  }
  const [owner, repo] = GITHUB_REPOSITORY.split('/')
  if (!owner || !repo) {
    console.error('Invalid GITHUB_REPOSITORY; expected "owner/repo"')
    process.exit(1)
  }
  const safeName = /^[A-Za-z0-9_.-]+$/
  if (!safeName.test(owner) || !safeName.test(repo)) {
    console.error('Invalid repository coordinates; refusing to proceed')
    process.exit(1)
  }
  const repoFlag = `--repo ${owner}/${repo}`
  return { owner, repo, repoFlag }
}

/**
 * Assert the preview branch is safe to mutate (not default or protected branches).
 * Exits the process if unsafe.
 * @param {string} branch
 * @param {string} defaultBranch
 */
export function assertSafePreviewBranch(branch, defaultBranch = '') {
  if (!/^[A-Za-z0-9._\/-]+$/.test(branch)) {
    console.error(
      'Invalid PREVIEW_BRANCH; only alphanumerics, . _ - and / are allowed'
    )
    process.exit(1)
  }
  if (branch.includes('..') || branch.startsWith('/') || branch.endsWith('/')) {
    console.error('Invalid PREVIEW_BRANCH; disallowed path-like form')
    process.exit(1)
  }
  const disallowed = new Set(['main', 'master', 'develop', 'release', 'stable'])
  if (disallowed.has(branch) || (defaultBranch && branch === defaultBranch)) {
    console.error(`Refusing to force-push protected branch: ${branch}`)
    process.exit(1)
  }
}

/**
 * Ensure the provided workdir is a safe ephemeral directory under the current repo root.
 * Only allows directories whose basename starts with `.preview-`.
 * @param {string} workdir
 */
export function assertSafeWorkdir(workdir) {
  const root = resolve(process.cwd())
  const resolved = resolve(workdir)
  if (!(resolved + '/').startsWith(root + '/')) {
    console.error('Unsafe workdir; must be inside repository root')
    process.exit(1)
  }
  const base = basename(resolved)
  if (!base.startsWith('.preview-')) {
    console.error('Unsafe workdir; must start with .preview-')
    process.exit(1)
  }
}

/**
 * Build and validate a GitHub https remote URL for authenticated pushes.
 * @param {string} owner
 * @param {string} repo
 * @param {string} token
 */
export function getGithubRemoteUrl(owner, repo, token) {
  if (!token) {
    console.error('Missing GH_TOKEN for remote URL construction')
    process.exit(1)
  }
  const remoteUrl = `https://x-access-token:${token}@github.com/${owner}/${repo}.git`
  try {
    const parsed = new URL(remoteUrl)
    if (parsed.protocol !== 'https:') throw new Error('protocol')
    if (parsed.hostname !== 'github.com') throw new Error('host')
    if (!parsed.pathname.endsWith(`/${repo}.git`)) throw new Error('path')
  } catch (_) {
    console.error('Refusing to use invalid remote URL for GitHub push')
    process.exit(1)
  }
  return remoteUrl
}

/**
 * Safely re-initialize a git repository in a workdir for a single-commit force push.
 * This avoids invoking shell `rm -rf .git` and validates branch, workdir, and remote URL.
 * @param {string} workdir
 * @param {string} branch
 * @param {string} remoteUrl
 * @param {{ owner?: string, repo?: string, defaultBranch?: string }} [ctx]
 */
export function safeReinitGitRepo(workdir, branch, remoteUrl, ctx = {}) {
  const { owner = '', repo = '', defaultBranch = '' } = ctx
  if (owner && repo) {
    assertSafePreviewBranch(branch, defaultBranch)
  }
  assertSafeWorkdir(workdir)
  // Remove .git folder directly via fs to avoid shell globs
  rmSync(join(workdir, '.git'), { recursive: true, force: true })
  runCommands(
    [
      'git init',
      `git checkout -b ${branch}`,
      `git remote add origin ${remoteUrl}`,
    ],
    { cwd: workdir }
  )
}

/**
 * Run multiple shell commands sequentially.
 * @param {string[]} commands
 * @param {ExecOpts} [opts]
 * @returns {void}
 */
export function runCommands(commands, opts = {}) {
  for (const command of commands) {
    sh(command, opts)
  }
}

/**
 * Ensure git user identity is set for CI commits in the given working directory.
 * @param {string} cwd
 * @returns {void}
 */
export function ensureGitIdentity(cwd) {
  runCommands(
    [
      'git config user.email "github-actions[bot]@users.noreply.github.com"',
      'git config user.name "github-actions[bot]"',
    ],
    { cwd }
  )
}

/**
 * Validate a package name to a conservative character set that is safe to
 * pass to shell-wrapped commands. Allows scoped names like @scope/name.
 * @param {string} name
 * @returns {boolean}
 */
export function isSafePackageName(name) {
  // Letters, digits, @, /, ., _, - only; no spaces or quotes
  return /^[A-Za-z0-9@/_.-]+$/.test(name)
}

/**
 * Assert a safe package name or exit the process.
 * @param {string} name
 * @returns {void}
 */
export function assertSafePackageName(name) {
  if (!isSafePackageName(name)) {
    console.error(`Refusing unsafe package name: ${name}`)
    process.exit(1)
  }
}

/**
 * Parse `pnpm -r list --depth -1 --json` output into Workspace[]
 * @param {string} jsonString
 * @returns {Workspace[]}
 */
export function parsePnpmWorkspaces(jsonString) {
  /** @type {{ name?: string, path?: string, private?: boolean }[]} */
  const parsedValue = JSON.parse(jsonString)
  return parsedValue
    .filter((workspace) => workspace && workspace.name && workspace.path)
    .map((workspace) => ({
      name: String(workspace.name),
      dir: String(workspace.path),
      private: !!workspace.private,
    }))
}

/**
 * Parse Turbo dry-run JSON output and return unique package names.
 * Handles both array and object shapes seen in practice.
 * @param {string} jsonString
 * @returns {string[]}
 */
export function parseTurboDryRunPackages(jsonString) {
  /** @type {any} */
  const parsedValue = JSON.parse(jsonString)
  /** @type {string[]} */
  let packageNames = []
  if (Array.isArray(parsedValue)) {
    packageNames = parsedValue.map((task) => task?.package).filter(Boolean)
  } else if (parsedValue?.tasks) {
    packageNames = parsedValue.tasks
      .map((task) => task?.package)
      .filter(Boolean)
  } else if (parsedValue?.packages) {
    packageNames = parsedValue.packages.filter(Boolean)
  }
  return Array.from(new Set(packageNames))
}

/**
 * Select affected publishable targets.
 * @param {Workspace[]} workspaces
 * @param {string[]} affected
 * @returns {string[]}
 */
export function computePublishableTargets(workspaces, affected) {
  const publishable = new Set(
    workspaces
      .filter((workspace) => !workspace.private)
      .map((workspace) => workspace.name)
  )
  return affected.filter((packageName) => publishable.has(packageName))
}

/**
 * Append short SHA to packed filenames.
 * @param {string[]} files
 * @param {string} short
 * @returns {string[]}
 */
export function renamePackedFilenames(files, short) {
  return files.map((filename) =>
    filename.endsWith('.tgz')
      ? filename.replace(/\.tgz$/, `-${short}.tgz`)
      : filename
  )
}

/**
 * Build raw.githubusercontent.com base URL for assets in the preview branch.
 * @param {string} owner
 * @param {string} repo
 * @param {string} branch
 * @param {number|string} prNumber
 */
export function buildRawBaseUrl(owner, repo, branch, prNumber) {
  return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${encodeURIComponent(
    String(prNumber)
  )}/`
}

/**
 * Build list of PreviewAsset from filenames and a base URL.
 * @param {string} rawBase
 * @param {string[]} files
 * @returns {PreviewAsset[]}
 */
export function buildAssets(rawBase, files) {
  return files.map((filename) => ({
    name: filename,
    url: `${rawBase}${encodeURIComponent(filename)}`,
  }))
}

/**
 * Construct a PreviewManifest object.
 * @param {object} params
 * @param {string} params.branch
 * @param {string} params.short
 * @param {number} params.pr
 * @param {PreviewAsset[]} params.assets
 * @param {string[]} params.targets
 * @param {number=} params.commentId
 * @returns {PreviewManifest}
 */
export function buildManifest({
  branch,
  short,
  pr,
  assets,
  targets,
  commentId,
}) {
  /** @type {PreviewManifest} */
  const manifest = { branch, short, pr, assets, targets }
  if (typeof commentId === 'number') manifest.commentId = commentId
  return manifest
}

/**
 * Build the sticky preview comment body for a PR.
 * @param {string} marker
 * @param {PreviewAsset[]} assets
 * @returns {string}
 */
export function buildPreviewCommentBody(marker, assets) {
  const header = `### 📦 Preview packages`
  const lines = assets.length
    ? assets.map((a) =>
        [`• **${a.name}**`, '```bash', `npm install "${a.url}"`, '```'].join(
          '\n'
        )
      )
    : ['_No publishable workspaces affected for this PR._']
  return [marker, header, '', ...lines].join('\n')
}
