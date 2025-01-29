import { basename, join } from 'node:path'
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
import chalk from 'chalk'

import { fetchPackageVersion } from './get-package-version.js'
import { Log, askQuestion, askYesNo } from './utils.js'

/** Fetches the contents of an MDXTS example from the GitHub repository and downloads them to the local file system. */
export async function fetchExample(exampleSlug: string, message: string = '') {
  let workingDirectory = process.cwd()
  const directoryPath = `examples/${exampleSlug}`
  const directoryName = chalk.bold(basename(directoryPath))
  const postMessage = ` Press enter to proceed or specify a different directory: `
  const userBaseDirectory = await askQuestion(
    message
      ? `${message}${postMessage}`
      : `Download the ${chalk.bold(directoryName)} example to ${chalk.bold(
          join(workingDirectory, exampleSlug)
        )}}?${postMessage}`
  )

  if (userBaseDirectory) {
    workingDirectory = join(workingDirectory, userBaseDirectory)
  } else {
    workingDirectory = join(workingDirectory, exampleSlug)
  }

  if (existsSync(workingDirectory)) {
    const isYes = await askYesNo(
      `The directory ${chalk.bold(
        workingDirectory
      )} already exists. Do you want to overwrite it?`,
      { defaultYes: false }
    )

    if (isYes) {
      rmdirSync(workingDirectory, { recursive: true })
      mkdirSync(workingDirectory, { recursive: true })
    } else {
      Log.info(
        `Skipping download of ${directoryName} example to ${chalk.bold(
          workingDirectory
        )}.`
      )
      return
    }
  } else {
    mkdirSync(workingDirectory, { recursive: true })
  }

  Log.info(
    `Downloading ${directoryName} example to ${chalk.bold(workingDirectory)}.`
  )

  await fetchGitHubDirectory({
    owner: 'souporserious',
    repo: 'renoun',
    branch: 'main',
    basePath: '.',
    directoryPath,
    workingDirectory,
  })

  const { detectPackageManager } = await import('@antfu/install-pkg')
  const packageManager = await detectPackageManager(process.cwd())

  await reformatPackageJson(workingDirectory)

  writeFileSync(
    join(workingDirectory, '.gitignore'),
    '.next\nnode_modules\nout',
    'utf-8'
  )

  const introInstallInstructions =
    workingDirectory === process.cwd()
      ? `Run`
      : `Change to the ${chalk.bold(userBaseDirectory ?? directoryName)} directory and run`

  Log.success(
    `Example ${chalk.bold(
      directoryName
    )} fetched and configured successfully! ${introInstallInstructions} ${chalk.bold(
      `${packageManager ?? 'npm'} install`
    )} to install the dependencies and get started.`
  )
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
  const directoryName = chalk.bold(basename(directoryPath))

  if (!response.ok) {
    throw new Error(
      `Failed to fetch ${chalk.red(directoryName)} at ${apiUrl}: ${
        response.statusText
      }`
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

/** Reformat package.json file to remove monorepo dependencies and use the latest MDXTS version. */
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
