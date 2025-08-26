import {
  existsSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  cpSync,
} from 'node:fs'
import { join, resolve } from 'node:path'
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
  computePublishableTargets,
  getChangedFiles,
  selectTouchedWorkspaces,
  buildReverseWorkspaceDeps,
  expandWithDependents,
  renamePackedFilenames,
  buildRawBaseUrl,
  buildAssets,
  buildManifest,
  assertSafePackageName,
  assertPathInsideRepo,
} from './utils.js'

ensureEnv(['GITHUB_REPOSITORY', 'GITHUB_SHA', 'GH_TOKEN', 'GITHUB_EVENT_PATH'])

const gitSha = String(process.env.GITHUB_SHA || '')
const eventPath = String(process.env.GITHUB_EVENT_PATH || '')
const githubToken = String(process.env.GH_TOKEN || '')

/** @type {{ pull_request?: { number?: number, base?: { sha?: string }, head?: { sha?: string } } }} */
const githubEventPayload = JSON.parse(readFileSync(eventPath, 'utf8'))
const pullRequestNumber = githubEventPayload.pull_request?.number
let baseSha = githubEventPayload.pull_request?.base?.sha ?? null
let headSha = String(githubEventPayload.pull_request?.head?.sha || gitSha)
if (!pullRequestNumber) {
  console.error('Could not resolve PR number from event payload')
  process.exit(1)
}
// Validate PR number to be strictly numeric
if (!/^\d+$/.test(String(pullRequestNumber))) {
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
const { owner: repositoryOwner, repo: repositoryName } = getRepoContext()
const octokit = new Octokit({ auth: githubToken })
let repoDefaultBranch = ''
try {
  const { data } = await octokit.rest.repos.get({
    owner: repositoryOwner,
    repo: repositoryName,
  })
  repoDefaultBranch = String(data?.default_branch || '')
} catch (_) {
  repoDefaultBranch = ''
}
assertSafePreviewBranch(PREVIEW_BRANCH, repoDefaultBranch)
const shortSha = headSha.slice(0, 7)
const previewsDirectory = join(process.cwd(), 'previews')

// Optional: ensure a configured Root Directory exists in the preview branch so platforms
// like Vercel do not fail builds due to missing root path. The directory will include a
// placeholder file so it is tracked by git. Validation is conservative to avoid traversal.
const ROOT_DIRECTORY = String(process.env.ROOT_DIRECTORY || '').trim()
/**
 * Validate a relative directory path for safety.
 * @param {string} pathInput
 * @returns {boolean}
 */
function isSafeRelativeDirectory(pathInput) {
  return (
    pathInput !== '' &&
    /^[A-Za-z0-9._\/-]+$/.test(pathInput) &&
    !pathInput.startsWith('/') &&
    !pathInput.includes('..') &&
    !pathInput.endsWith('/')
  )
}

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

const workspaces = getWorkspaces()
// Exclude the repo root workspace from detection to avoid name collisions (e.g. root named
// the same as a publishable package). The root path equals process.cwd().
const repositoryRoot = resolve(process.cwd())
const workspacesForDetection = workspaces.filter(
  (workspace) => resolve(workspace.path) !== repositoryRoot
)

/**
 * Determine candidate targets by using a conservative git-diff-based detector
 * plus transitive dependents. This avoids relying on Turbo for detection.
 */
const changedFiles = getChangedFiles(baseSha, headSha)
const directlyTouched = selectTouchedWorkspaces(
  workspacesForDetection,
  changedFiles
)
const reverseDeps = buildReverseWorkspaceDeps(workspacesForDetection)
const touchedWithDependents = expandWithDependents(directlyTouched, reverseDeps)

/** @type {string[]} */
let targets = computePublishableTargets(workspaces, touchedWithDependents)

// If nothing is affected, write an empty manifest so the comment step can remove the sticky comment
if (targets.length === 0) {
  /** @type {import('./utils.js').PreviewManifest} */
  const emptyManifest = buildManifest({
    branch: PREVIEW_BRANCH,
    short: shortSha,
    pr: pullRequestNumber,
    assets: buildAssets(
      buildRawBaseUrl(
        repositoryOwner,
        repositoryName,
        PREVIEW_BRANCH,
        pullRequestNumber
      ),
      []
    ),
    targets: [],
  })
  writeFileSync(
    join(previewsDirectory, 'manifest.json'),
    JSON.stringify(emptyManifest, null, 2)
  )
  console.log(
    'No publishable workspaces affected — wrote empty manifest and skipped preview branch update'
  )
  process.exit(0)
}

// Ensure uniqueness just in case Turbo output included duplicates
targets = Array.from(new Set(targets))

// Map package name to workspace for quick lookup
/** @type {Map<string, { name: string, path: string, private: boolean }>} */
const nameToWorkspace = new Map()
for (const workspaceEntry of workspaces) {
  const existing = nameToWorkspace.get(workspaceEntry.name)
  if (!existing) {
    nameToWorkspace.set(workspaceEntry.name, workspaceEntry)
  } else {
    // Prefer non-root workspace when duplicate names exist
    const existingIsRoot = resolve(existing.path) === repositoryRoot
    const currentIsRoot = resolve(workspaceEntry.path) === repositoryRoot
    if (existingIsRoot && !currentIsRoot) {
      nameToWorkspace.set(workspaceEntry.name, workspaceEntry)
    }
  }
}

/**
 * Helper: tarball file name that pnpm/npm will emit for a workspace package.
 * @param {{ name: string, version: string }} packageJson
 * @returns {string}
 */
function tarballNameFromPkgJson(packageJson) {
  // Scoped packages: @scope/name -> scope-name
  const base = packageJson.name.replace(/^@/, '').replace('/', '-')
  return `${base}-${packageJson.version}.tgz`
}

/**
 * Build forward dependency map: workspace name -> Set(internal workspace dependencies)
 * @param {Array<{ name: string, path: string }>} workspacesList
 * @returns {Map<string, Set<string>>}
 */
function buildWorkspaceDependencies(workspacesList) {
  const nameToWorkspaceMap = new Map(
    workspacesList.map((workspaceEntry) => [
      workspaceEntry.name,
      workspaceEntry,
    ])
  )
  const dependenciesMap = new Map()
  for (const workspaceEntry of workspacesList) {
    const packageJson = JSON.parse(
      readFileSync(join(workspaceEntry.path, 'package.json'), 'utf8')
    )
    const dependencySet = new Set()
    for (const field of [
      'dependencies',
      'optionalDependencies',
      'peerDependencies',
    ]) {
      const dependenciesRecord = packageJson[field] || {}
      for (const dependencyName of Object.keys(dependenciesRecord)) {
        if (nameToWorkspaceMap.has(dependencyName))
          dependencySet.add(dependencyName)
      }
    }
    dependenciesMap.set(workspaceEntry.name, dependencySet)
  }
  return dependenciesMap
}

/**
 * DFS include all internal dependencies (down-graph).
 * @param {string[]} seedNames
 * @param {Map<string, Set<string>>} dependenciesMap
 * @returns {string[]}
 */
function expandWithDependencies(seedNames, dependenciesMap) {
  const resultSet = new Set()
  const visitDependency = (name) => {
    if (resultSet.has(name)) return
    resultSet.add(name)
    for (const dependencyName of dependenciesMap.get(name) || [])
      visitDependency(dependencyName)
  }
  for (const seedName of seedNames) visitDependency(seedName)
  return Array.from(resultSet)
}

/**
 * Temporarily rewrite internal dependencies to tarball URLs, run callback(), then restore.
 * If PREVIEW_EMBED_PEERS=1, internal peerDependencies are also rewritten.
 * @param {string} workspacePath
 * @param {Set<string>} internalPackageNamesSet
 * @param {Map<string, string>} packageNameToUrl
 * @param {() => unknown} callback
 */
function withRewrittenDependenciesToUrls(
  workspacePath,
  internalPackageNamesSet,
  packageNameToUrl,
  callback
) {
  const packageJsonPath = join(workspacePath, 'package.json')
  const originalJson = readFileSync(packageJsonPath, 'utf8')
  const packageJson = JSON.parse(originalJson)
  const fields = ['dependencies', 'optionalDependencies']

  for (const field of fields) {
    const record = packageJson[field]
    if (!record) continue
    for (const dependencyName of Object.keys(record)) {
      if (internalPackageNamesSet.has(dependencyName)) {
        record[dependencyName] = packageNameToUrl.get(dependencyName) // e.g. https://raw.github.../dep-1.2.3-<sha>.tgz
      }
    }
  }

  writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2))
  try {
    return callback()
  } finally {
    writeFileSync(packageJsonPath, originalJson)
  }
}

// Prepare a working directory for the preview branch content
const workingDirectory = join(process.cwd(), '.preview-branch')
assertSafeWorkdir(workingDirectory)
if (existsSync(workingDirectory)) {
  rmSync(workingDirectory, { recursive: true, force: true })
}
mkdirSync(workingDirectory, { recursive: true })

// Initialize a minimal repo to retrieve existing branch contents (if any)
const remoteUrl = getGithubRemoteUrl(
  repositoryOwner,
  repositoryName,
  githubToken
)
sh(`git init`, { cwd: workingDirectory })
sh(`git remote add origin ${remoteUrl}`, { cwd: workingDirectory })

let branchExists = false
try {
  const heads = sh(`git ls-remote --heads origin ${PREVIEW_BRANCH}`)
  branchExists = (heads?.trim().length ?? 0) > 0
} catch {
  branchExists = false
}

if (branchExists) {
  // Fetch and checkout existing branch content
  sh(`git fetch --depth=1 origin ${PREVIEW_BRANCH}`, { cwd: workingDirectory })
  sh(`git checkout -b ${PREVIEW_BRANCH} origin/${PREVIEW_BRANCH}`, {
    cwd: workingDirectory,
  })
} else {
  // Create an empty working tree for the new branch
  sh(`git checkout -b ${PREVIEW_BRANCH}`, { cwd: workingDirectory })
}

// Ensure PR directory is a fresh container for latest commit tarballs only
const pullRequestDirectory = join(workingDirectory, String(pullRequestNumber))
if (existsSync(pullRequestDirectory)) {
  rmSync(pullRequestDirectory, { recursive: true, force: true })
}
mkdirSync(pullRequestDirectory, { recursive: true })

// If a preview root dir is requested, ensure it exists in the working tree with a
// `.gitkeep` file so hosting providers that look for a specific root do not fail.
if (ROOT_DIRECTORY && isSafeRelativeDirectory(ROOT_DIRECTORY)) {
  const rootDirPath = join(workingDirectory, ROOT_DIRECTORY)
  if (!existsSync(rootDirPath)) {
    mkdirSync(rootDirPath, { recursive: true })
  }
  const gitkeepPath = join(rootDirPath, '.gitkeep')
  if (!existsSync(gitkeepPath)) {
    writeFileSync(gitkeepPath, '')
  }
}

// Build internal dependencies graph and include transitive internal dependencies for all targets
const dependenciesMap = buildWorkspaceDependencies(workspaces)
let targetsWithDependencies = expandWithDependencies(targets, dependenciesMap)
// Ensure uniqueness and stable order
targetsWithDependencies = Array.from(new Set(targetsWithDependencies))

// Precompute expected tarball names and the final renamed names (with short sha)
const expectedTarballFilenames = targetsWithDependencies.map((name) => {
  const workspaceEntry = nameToWorkspace.get(name)
  if (!workspaceEntry) {
    throw new Error(`Workspace not found for ${name}`)
  }
  const packageJson = JSON.parse(
    readFileSync(join(workspaceEntry.path, 'package.json'), 'utf8')
  )
  return tarballNameFromPkgJson(packageJson) // e.g. scope-name-1.2.3.tgz
})
const renamedTarballFilenames = renamePackedFilenames(
  expectedTarballFilenames,
  shortSha
) // append -<sha> etc.

// Build URL map to embed into package.json before packing
const rawBaseUrl = buildRawBaseUrl(
  repositoryOwner,
  repositoryName,
  PREVIEW_BRANCH,
  pullRequestNumber
)
const packageNameToRenamedFilename = new Map(
  targetsWithDependencies.map((packageName, index) => [
    packageName,
    renamedTarballFilenames[index],
  ])
)
const packageNameToUrl = new Map(
  targetsWithDependencies.map((packageName) => [
    packageName,
    `${rawBaseUrl}/${packageNameToRenamedFilename.get(packageName)}`,
  ])
)

// Pack each package using pnpm, with internal deps rewritten to PR tarball URLs
console.log(
  'Packing targets with internal deps rewritten to tarball URLs using pnpm pack:',
  targetsWithDependencies.join(', ')
)

/** @type {string[]} */
const tarballFilenames = []
const internalWorkspacePackageNamesSet = new Set(targetsWithDependencies)

for (const packageName of targetsWithDependencies) {
  // Validate package name
  assertSafePackageName(packageName)
  const workspace = nameToWorkspace.get(packageName)
  if (!workspace) {
    console.warn(`Workspace not found for ${packageName}; skipping`)
    continue
  }
  assertPathInsideRepo(workspace.path)

  // Determine the expected on-disk pack filename
  const packageJson = JSON.parse(
    readFileSync(join(workspace.path, 'package.json'), 'utf8')
  )
  const expectedTarballFilename = tarballNameFromPkgJson(packageJson)
  const destinationFilename = packageNameToRenamedFilename.get(packageName)
  if (!destinationFilename) {
    console.error(`Could not find renamed file for ${packageName}`)
    process.exit(1)
  }

  console.log(
    `→ ${packageName}: embedding internal tarball URLs, then pnpm pack`
  )
  withRewrittenDependenciesToUrls(
    workspace.path,
    internalWorkspacePackageNamesSet,
    packageNameToUrl,
    () => {
      // pnpm pack writes <scope-name>-<version>.tgz in the workspace directory
      sh(`npm_config_ignore_scripts=1 pnpm pack --pack-destination .`, {
        cwd: workspace.path,
      })
    }
  )

  if (!existsSync(join(workspace.path, expectedTarballFilename))) {
    console.error(
      `pnpm pack did not create expected tarball for ${packageName}: ${expectedTarballFilename}`
    )
    process.exit(1)
  }

  // Copy into PR folder with the *renamed* file name that matches embedded URLs
  cpSync(
    join(workspace.path, expectedTarballFilename),
    join(pullRequestDirectory, destinationFilename)
  )
  tarballFilenames.push(destinationFilename)
}

// Re-init to ensure force-pushed single-commit history
safeReinitGitRepo(workingDirectory, PREVIEW_BRANCH, remoteUrl, {
  owner: repositoryOwner,
  repo: repositoryName,
  defaultBranch: repoDefaultBranch,
})
ensureGitIdentity(workingDirectory)
runCommands(
  [
    'git add -A',
    `git commit -m "update ${pullRequestNumber}:${shortSha} [skip ci]"`,
    `git push -f origin ${PREVIEW_BRANCH}`,
  ],
  { cwd: workingDirectory }
)

// Create manifest for the commenter step
/** @type {{ name: string, url: string }[]} */
const assets = buildAssets(rawBaseUrl, tarballFilenames)
/** @type {import('./utils.js').PreviewManifest} */
const manifest = buildManifest({
  branch: PREVIEW_BRANCH,
  short: shortSha,
  pr: pullRequestNumber,
  assets,
  targets: Array.from(new Set(targets)),
})
writeFileSync(
  join(previewsDirectory, 'manifest.json'),
  JSON.stringify(manifest, null, 2)
)
console.log(
  `Prepared manifest with ${assets.length} assets and updated branch ${PREVIEW_BRANCH}`
)
