#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, sep } from 'node:path'
import { stdin, stdout } from 'node:process'
import { createInterface } from 'node:readline/promises'
import { Project } from 'ts-morph'
import chalk from 'chalk'

import {
  codemodNextJsConfig,
  codemodNextMjsConfig,
} from './codemod-next-config'

async function askQuestion(question: string) {
  const readline = createInterface({ input: stdin, output: stdout })
  const answer = await readline.question(
    `${chalk.rgb(205, 237, 255).bold('mdxts: ')}${question}`
  )
  readline.close()
  return answer
}

async function askYesNo(
  question: string,
  {
    defaultYes = true,
    description,
  }: {
    defaultYes?: boolean
    description?: string
  } = {}
) {
  const answer = await askQuestion(
    `${question} [${defaultYes ? 'Y/n' : 'y/N'}] ${
      description ? chalk.dim(description) : ''
    }`
  )
  return answer === '' ? defaultYes : answer.toLowerCase().startsWith('y')
}

class Log {
  static info(message: string) {
    console.log(chalk.rgb(205, 237, 255).bold('mdxts: ') + message)
  }

  static error(message: string) {
    console.error(
      chalk.rgb(237, 35, 0).bold('mdxts: ') + chalk.rgb(225, 205, 205)(message)
    )
  }

  static success(message: string) {
    console.log(chalk.rgb(0, 204, 102).bold('mdxts: ') + message)
  }

  static warning(message: string) {
    console.warn(
      chalk.rgb(255, 153, 51).bold('mdxts: ') +
        chalk.rgb(225, 200, 190)(message)
    )
  }
}

const states = {
  INITIAL_STATE: 'initialState',
  CHECK_MDXTS_INSTALLED: 'checkMdxtsInstalled',
  INSTALL_MDXTS: 'installMdxts',
  CHECK_NEXT_CONFIG_EXISTS: 'checkNextConfigExists',
  CONFIGURE_MDXTS_NEXT: 'configureMdxtsNext',
  CREATE_SOURCE: 'createSource',
  SUCCESS_STATE: 'successState',
  ERROR_STATE: 'errorState',
}
let errorMessage = ''

export async function start() {
  const context: Record<string, any> = {}
  let currentState = states.INITIAL_STATE

  while (
    currentState !== states.SUCCESS_STATE &&
    currentState !== states.ERROR_STATE
  ) {
    try {
      switch (currentState) {
        case states.INITIAL_STATE:
          await checkNextJsProject()
          currentState = states.CHECK_MDXTS_INSTALLED
          break
        case states.CHECK_MDXTS_INSTALLED:
          if (await checkMdxtsInstalled()) {
            currentState = states.CHECK_NEXT_CONFIG_EXISTS
          } else {
            currentState = states.INSTALL_MDXTS
          }
          break
        case states.INSTALL_MDXTS:
          const confirmInstall = await askYesNo(
            `Install ${chalk.bold('mdxts')} package and required dependencies?`
          )
          if (confirmInstall) {
            await installMdxts()
            currentState = states.CONFIGURE_MDXTS_NEXT
          } else {
            currentState = states.ERROR_STATE
            errorMessage = 'mdxts installation cancelled.'
          }
          currentState = states.CONFIGURE_MDXTS_NEXT
          break
        case states.CHECK_NEXT_CONFIG_EXISTS:
          context.nextJsConfigExists = checkNextJsConfigExists()
          currentState = states.CONFIGURE_MDXTS_NEXT
          break
        case states.CONFIGURE_MDXTS_NEXT:
          if (checkMdxtsNextConfigured()) {
            currentState = states.CREATE_SOURCE
            break
          }
          const confirmConfig = await askYesNo(
            `Configure the ${chalk.bold('mdxts/next')} plugin?`,
            { description: 'This will add the plugin to your Next.js config.' }
          )
          if (confirmConfig) {
            await configureNextPlugin(context.nextJsConfigExists)
          } else {
            Log.info('Configuration skipped.')
          }
          currentState = states.CREATE_SOURCE
          break
        case states.CREATE_SOURCE:
          const confirmCreateSource = await askYesNo(
            `Do you want to create a data source and render a page to display it?`
          )
          if (confirmCreateSource) {
            await createSource()
          } else {
            Log.info('Create data source skipped.')
          }
          currentState = states.SUCCESS_STATE
          break
        default:
          throw new Error(`State "${currentState}" does not exist`)
      }
    } catch (error) {
      if (error instanceof Error) {
        errorMessage = error.message
      }
      currentState = states.ERROR_STATE
    }
  }

  if (currentState === states.SUCCESS_STATE) {
    Log.success('mdxts configured successfully!')
  } else {
    Log.error(errorMessage)
    process.exit(1)
  }
}

start()

export async function checkNextJsProject() {
  const packageJsonPath = join(process.cwd(), 'package.json')
  if (!existsSync(packageJsonPath)) {
    throw new Error(
      'No package.json found. Please run this command in a Next.js project directory.'
    )
  }
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))
  if (!packageJson.devDependencies?.next && !packageJson.dependencies?.next) {
    throw new Error(
      `Next.js is required. Please add Next.js to the current project or use ${chalk.inverse(
        'npm create next-app@latest --typescript'
      )} and run ${chalk.inverse('npm create mdxts')} again.`
    )
  }
}

export async function checkMdxtsInstalled() {
  const packageJsonPath = join(process.cwd(), 'package.json')
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))
  return Boolean(packageJson.dependencies?.mdxts)
}

export function checkNextJsConfigExists() {
  const nextConfigJsPath = join(process.cwd(), 'next.config.js')
  const nextConfigMjsPath = join(process.cwd(), 'next.config.mjs')
  if (!existsSync(nextConfigJsPath) && !existsSync(nextConfigMjsPath)) {
    return false
  }
  return true
}

export function checkMdxtsNextConfigured() {
  const nextConfigJsPath = join(process.cwd(), 'next.config.js')
  const nextConfigMjsPath = join(process.cwd(), 'next.config.mjs')
  if (!existsSync(nextConfigJsPath) && !existsSync(nextConfigMjsPath)) {
    return false
  }
  const nextConfigContents = readFileSync(
    existsSync(nextConfigJsPath) ? nextConfigJsPath : nextConfigMjsPath,
    'utf-8'
  )
  return (
    nextConfigContents.includes('createMdxtsPlugin') &&
    nextConfigContents.includes('mdxts/next')
  )
}

const defaultNextConfigContent = `
import { createMdxtsPlugin } from 'mdxts/next'

const withMdxts = createMdxtsPlugin({ theme: 'nord' })

export default withMdxts()
`.trim()

export async function configureNextPlugin(configExists: boolean) {
  const nextConfigMjsPath = join(process.cwd(), 'next.config.mjs')

  try {
    if (configExists) {
      const nextConfigPath = existsSync(join(process.cwd(), 'next.config.js'))
        ? join(process.cwd(), 'next.config.js')
        : nextConfigMjsPath
      const nextConfigContent = readFileSync(nextConfigPath, 'utf-8')

      if (nextConfigContent.length === 0) {
        writeFileSync(nextConfigPath, defaultNextConfigContent)
      } else {
        const project = new Project({ useInMemoryFileSystem: true })
        const sourceFile = project.createSourceFile(
          'index.ts',
          nextConfigContent
        )
        if (nextConfigPath.endsWith('.js')) {
          codemodNextJsConfig(sourceFile)
        } else {
          codemodNextMjsConfig(sourceFile)
        }
        writeFileSync(nextConfigPath, sourceFile.getFullText())
      }
    } else {
      writeFileSync(nextConfigMjsPath, defaultNextConfigContent)
    }
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Configuring mdxts failed: ${error.message}`)
    }
  }
}

export async function installMdxts() {
  const { installPackage } = await import('@antfu/install-pkg')
  Log.info(`Installing ${chalk.bold('mdxts')} and required dependencies...`)
  try {
    await installPackage(['mdxts', 'shiki', 'prettier'])
    Log.success('mdxts package installed successfully!')
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Installing mdxts failed: ${error.message}`)
    }
  }
}

export async function createSource() {
  let sourcePathInput = await askQuestion(
    'Enter a file glob pattern or directory path to use as a data source: '
  )
  const sourcePath = join(process.cwd(), sourcePathInput)
  const project = new Project({ skipAddingFilesFromTsConfig: true })
  let sourceFiles

  try {
    const directory = project.addDirectoryAtPath(sourcePath)
    sourceFiles = directory.addSourceFilesAtPaths(['**/*.{md,mdx,ts,tsx}'])
  } catch (error) {
    sourceFiles = project.addSourceFilesAtPaths([sourcePath])
  }

  if (sourceFiles.length === 0) {
    Log.warning(
      `No source files found at ${chalk.bold(
        sourcePathInput
      )}. Please check that the file pattern or directory path is correct and try again. If this is expected, make sure to add at least one MDX or TypeScript file to the targeted directories.`
    )
  }

  const dataIdentifier = sourcePathInput.split(sep).pop()!
  let singularDataIdentifier = dataIdentifier.replace(/s$/, '')

  if (singularDataIdentifier === dataIdentifier) {
    singularDataIdentifier = `${dataIdentifier}Item`
  }

  const allDataIdentifier = `all${
    dataIdentifier.charAt(0).toUpperCase() + dataIdentifier.slice(1)
  }`
  const dataFile = project.addSourceFileAtPathIfExists('data.ts')
  const shouldOverwriteDataFile = dataFile
    ? await askYesNo(`Overwrite existing ${chalk.bold('data.ts')} file?`, {
        defaultYes: false,
      })
    : true

  if (!shouldOverwriteDataFile) {
    Log.warning('Create data source cancelled.')
    return
  }

  project.createSourceFile(
    'data.ts',
    `
import { createSource } from 'mdxts'
  
export const ${allDataIdentifier} = createSource('${sourcePathInput}')
  `.trim(),
    { overwrite: true }
  )

  const hasSourceDirectory = project.getDirectory('src')

  // create a Next.js app router page
  const pagePath = join(
    process.cwd(),
    hasSourceDirectory
      ? `app/src/[${dataIdentifier}]/page.tsx`
      : `app/[${dataIdentifier}]/page.tsx`
  )
  const relativePagePath = pagePath.replace(process.cwd() + sep, '')
  const exampleSourcePage = `
export default async function Page({ params }: { params: { slug: string } }) {
  const ${singularDataIdentifier} = await ${allDataIdentifier}.get(params.slug)

  if (${singularDataIdentifier} === undefined) {
    return notFound()
  }

  const { Content, metadata } = ${singularDataIdentifier}

  return (
    <>
      {metadata ? (
        <div>
          <h1>{metadata.title}</h1>
          <p>{metadata.description}</p>
        </div>
      ) : null}
      {Content ? <Content /> : null}
    </>
  )
}

`.trim()

  const pageFile = project.addSourceFileAtPathIfExists(pagePath)
  const shouldOverwritePageFile = pageFile
    ? await askYesNo(
        `Overwrite existing ${chalk.bold(relativePagePath)} file?`,
        { defaultYes: false }
      )
    : true

  if (!shouldOverwritePageFile) {
    Log.warning(
      `Create data source cancelled. Only ${chalk.bold(
        'data.ts'
      )} file was created.`
    )
    return
  }

  project.createSourceFile(
    pagePath,
    hasSourceDirectory
      ? `import { notFound } from 'next/navigation'\nimport { ${allDataIdentifier} } from '../../../data'\n\n${exampleSourcePage}`
      : `import { notFound } from 'next/navigation'\nimport { ${allDataIdentifier} } from '../../data'\n\n${exampleSourcePage}`,
    { overwrite: true }
  )

  project.saveSync()
}
