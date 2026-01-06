import { confirm, text, isCancel, spinner, log } from '@clack/prompts'
import { basename, isAbsolute, join, relative, sep } from 'node:path'
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  rmdirSync,
  writeFileSync,
} from 'node:fs'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import color from 'picocolors'

import { fetchPackageVersion } from './get-package-version.js'

/**
 * Fetches the contents of a renoun example from the GitHub repository and
 * downloads them to the local file system.
 */
export async function fetchExample(exampleSlug: string, message: string = '') {
  let workingDirectory = process.cwd()
  const directoryPath = `examples/${exampleSlug}`
  const directoryName = color.bold(basename(directoryPath))
  const postMessage = ` Press enter to proceed or specify a different directory: `
  const userBaseDirectory = await text({
    message: message
      ? `${message}${postMessage}`
      : `Download the ${directoryName} example to ${color.bold(
          join(workingDirectory, exampleSlug)
        )}?${postMessage}`,
    placeholder: exampleSlug,
  })

  if (isCancel(userBaseDirectory)) {
    throw new Error('Example download cancelled.')
  }

  if (userBaseDirectory) {
    workingDirectory = join(workingDirectory, userBaseDirectory)
  } else {
    workingDirectory = join(workingDirectory, exampleSlug)
  }

  if (existsSync(workingDirectory)) {
    const isYes = await confirm({
      message: `The directory ${color.bold(
        workingDirectory
      )} already exists. Do you want to overwrite it?`,
      initialValue: false,
    })

    if (isCancel(isYes)) {
      log.warn('Overwrite confirmation cancelled.')
      throw new Error('User cancelled the overwrite.')
    }

    if (isYes) {
      try {
        rmdirSync(workingDirectory, { recursive: true })
        mkdirSync(workingDirectory, { recursive: true })
        log.info(`Overwritten the directory ${color.bold(workingDirectory)}.`)
      } catch (error) {
        if (error instanceof Error) {
          throw new Error(
            `Failed to overwrite directory ${workingDirectory}: ${error.message}`
          )
        }
      }
    } else {
      log.info(
        `Skipping download of ${directoryName} example to ${color.bold(
          workingDirectory
        )}.`
      )
      return false
    }
  } else {
    mkdirSync(workingDirectory, { recursive: true })
  }

  log.info(
    `Downloading ${directoryName} example to ${color.bold(workingDirectory)}.`
  )

  const loader = spinner()

  loader.start('Fetching example files...')

  try {
    await fetchGitHubDirectory({
      owner: 'souporserious',
      repo: 'renoun',
      branch: 'main',
      basePath: '.',
      directoryPath,
      workingDirectory,
    })
    loader.stop('Example files fetched successfully.')
  } catch (error) {
    log.error('Failed to fetch example files.')
    throw error
  }

  const { detectPackageManager } = await import('@antfu/install-pkg')
  const packageManager = await detectPackageManager(workingDirectory)

  try {
    await reformatPackageJson(workingDirectory)
    loader.start('Reformatting package.json...')
    loader.stop('package.json reformatted successfully.')
  } catch (error) {
    log.error('Failed to reformat package.json.')
    throw error
  }

  writeFileSync(
    join(workingDirectory, '.gitignore'),
    `# dependencies
node_modules

# testing
coverage

# renoun
.renoun

# next.js
.next
out
next-env.d.ts

# production
build
dist

# misc
.DS_Store

# debug
npm-debug.log*

# environment files
.env
.env.local

# typescript
*.tsbuildinfo
`,
    'utf-8'
  )

  const introInstallInstructions =
    workingDirectory === process.cwd()
      ? `Run ${color.bold(`${packageManager ?? 'npm'} install`)} to install the dependencies and get started.`
      : (() => {
          const cwd = process.cwd()
          const relativeWorkingDirectory = relative(cwd, workingDirectory)
          const canUseRelativePath =
            relativeWorkingDirectory !== '' &&
            relativeWorkingDirectory !== '.' &&
            !isAbsolute(relativeWorkingDirectory) &&
            relativeWorkingDirectory !== '..' &&
            !relativeWorkingDirectory.startsWith(`..${sep}`)

          const cdPath = canUseRelativePath
            ? relativeWorkingDirectory
            : workingDirectory

          return `Change directories (cd ${color.bold(
            `"${cdPath}"`
          )}) and run ${color.bold(
            `${packageManager ?? 'npm'} install`
          )} to install the dependencies and get started.`
        })()

  log.success(
    `Example ${color.bold(
      directoryName
    )} fetched and configured successfully! ${introInstallInstructions}`
  )

  return true
}

/** Fetches the contents of a directory in a GitHub repository and downloads them to the local file system. */
async function fetchGitHubDirectory({
  owner,
  repo,
  branch,
  directoryPath,
  workingDirectory,
  basePath,
}: {
  owner: string
  repo: string
  branch: string
  basePath: string
  directoryPath: string
  workingDirectory: string
}) {
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${directoryPath}?ref=${branch}`
  const response = await fetch(apiUrl)
  const directoryName = color.bold(basename(directoryPath))

  if (!response.ok) {
    throw new Error(
      `Failed to fetch ${directoryName} from ${apiUrl}: ${response.statusText}`
    )
  }

  const items = await response.json()

  for (let item of items) {
    if (item.type === 'dir') {
      const nextDirectoryPath = join(directoryPath, item.name)
      const nextBasePath = join(basePath, item.name)

      mkdirSync(join(workingDirectory, nextBasePath), { recursive: true })

      await fetchGitHubDirectory({
        owner,
        repo,
        branch,
        workingDirectory,
        directoryPath: nextDirectoryPath,
        basePath: nextBasePath,
      })
    } else if (item.type === 'file') {
      const filePath = join(workingDirectory, basePath, item.name)
      await downloadFile(item.download_url, filePath)
    }
  }
}

const downloadFile = async (url: string, filePath: string) => {
  const response = await fetch(url)

  if (!response.body) {
    throw new Error('Invalid response body')
  }

  if (!response.ok) {
    throw new Error(`Unexpected response ${response.statusText}`)
  }

  const reader = response.body.getReader()
  const stream = new Readable({
    async read() {
      const { done, value } = await reader.read()
      if (done) {
        this.push(null)
      } else {
        this.push(Buffer.from(value))
      }
    },
  })
  const fileStream = createWriteStream(filePath)

  await pipeline(stream, fileStream)
}

/**
 * Reformat package.json file to remove monorepo dependencies and use the latest
 * versions for `catalog:` and `workspace:*`.
 */
async function reformatPackageJson(workingDirectory: string) {
  const packageJsonPath = join(workingDirectory, 'package.json')
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))

  // Remove "@examples/" prefix from package name
  packageJson.name = packageJson.name.replace('@examples/', '')

  // Replace "workspace:*" and "catalog:" with the latest versions of the package
  for (const [packageName, version] of Object.entries(
    packageJson.dependencies
  )) {
    if (version === 'catalog:' || version === 'workspace:*') {
      const latestVersion = await fetchPackageVersion(packageName)
      packageJson.dependencies[packageName] = latestVersion
    }
  }

  // Write the updated package.json file
  writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2), 'utf-8')
}
