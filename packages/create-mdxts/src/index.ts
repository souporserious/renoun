#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { extname, join, resolve, sep } from 'node:path'
import { Project } from 'ts-morph'
import chalk from 'chalk'

import {
  codemodNextJsConfig,
  codemodNextMjsConfig,
} from './codemod-next-config'
import { fetchExample } from './fetch-example'
import { Log, askQuestion, askYesNo } from './utils'

const states = {
  INITIAL_STATE: 'initialState',
  CHECK_TYPESCRIPT_INSTALLED: 'checkTypescriptInstalled',
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
  if (process.argv.includes('--example')) {
    const exampleSlug = process.argv[process.argv.indexOf('--example') + 1]
    await fetchExample(exampleSlug)
    return
  }

  const packageJson = JSON.parse(
    readFileSync(resolve(__dirname, '../package.json'), 'utf-8')
  )
  const packageVersion = await fetch(
    'https://registry.npmjs.org/-/package/create-mdxts/dist-tags'
  ).then((res) => res.json())

  if (packageJson.version !== packageVersion.latest) {
    const installCommand = chalk.bold('npm create mdxts@latest')
    Log.warning(
      `A new version of ${chalk.bold(
        'create-mdxts'
      )} is available. Please use the latest version by running ${installCommand}.`
    )
  }

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
          currentState = states.CHECK_TYPESCRIPT_INSTALLED
          break
        case states.CHECK_TYPESCRIPT_INSTALLED:
          if (await checkTypeScriptInstalled()) {
            currentState = states.CHECK_NEXT_CONFIG_EXISTS
          } else {
            throw new Error(
              `TypeScript is required. Please add TypeScript to the current project and run ${chalk.bold(
                'npm create mdxts'
              )} again.`
            )
          }
          break
        case states.CHECK_NEXT_CONFIG_EXISTS:
          context.nextJsConfigExists = checkNextJsConfigExists()
          currentState = states.CHECK_MDXTS_INSTALLED
          break
        case states.CHECK_MDXTS_INSTALLED:
          if (await checkMdxtsInstalled()) {
            currentState = states.CONFIGURE_MDXTS_NEXT
          } else {
            currentState = states.INSTALL_MDXTS
          }
          break
        case states.INSTALL_MDXTS:
          const confirmInstall = await askYesNo(
            `Install ${chalk.bold('mdxts')} package and required dependencies (prettier, shiki)?`
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
            `Do you want to create a source and render a page to display it?`,
            {
              description: `This should be a collection of MDX and TypeScript files.`,
            }
          )
          if (confirmCreateSource) {
            await createSource()
          } else {
            Log.info('Create source skipped.')
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
      `Next.js is required. Please add Next.js to the current project or use ${chalk.bold(
        'npm create next-app@latest --typescript'
      )} and run ${chalk.bold('npm create mdxts')} again.`
    )
  }
}

export async function checkTypeScriptInstalled() {
  const tsconfigPath = join(process.cwd(), 'tsconfig.json')
  const packageJsonPath = join(process.cwd(), 'package.json')
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))
  return Boolean(
    existsSync(tsconfigPath) ||
      packageJson.devDependencies?.typescript ||
      packageJson.dependencies?.typescript
  )
}

export async function checkMdxtsInstalled() {
  const packageJsonPath = join(process.cwd(), 'package.json')
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))
  return Boolean(
    packageJson.devDependencies?.mdxts || packageJson.dependencies?.mdxts
  )
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
    await installPackage(['mdxts', 'prettier', 'shiki'])
    Log.success('mdxts, prettier, and shiki packages installed successfully!')
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Installing mdxts failed: ${error.message}`)
    }
  }
}

export async function createSource() {
  const createdSourceFiles = []
  let sourcePathInput = await askQuestion(
    'Enter a file glob pattern or directory path to use as a source: '
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
    Log.warning('Create source cancelled.')
    return
  }

  let filePattern =
    extname(sourcePathInput) === ''
      ? join(sourcePathInput, '**', '*.{ts,tsx,mdx}')
      : sourcePathInput

  if (filePattern.startsWith(sep)) {
    filePattern = `.${filePattern}`
  }

  project.createSourceFile(
    'data.ts',
    `
import { createSource } from 'mdxts'
  
export const ${allDataIdentifier} = createSource('${filePattern}')
  `.trim(),
    { overwrite: true }
  )
  createdSourceFiles.push('data.ts')

  const hasSourceDirectory = project.getDirectory('src')

  // create a Next.js app router page
  const pagePath = join(
    process.cwd(),
    hasSourceDirectory
      ? `app/src/[...${dataIdentifier}]/page.tsx`
      : `app/[...${dataIdentifier}]/page.tsx`
  )
  const relativePagePath = pagePath.replace(process.cwd() + sep, '')
  const exampleSourcePage = `
export default async function Page({ params }: { params: { ${dataIdentifier}: string[] } }) {
  const ${singularDataIdentifier} = await ${allDataIdentifier}.get(params.${dataIdentifier})

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
      `Create source cancelled. Only ${chalk.bold('data.ts')} file was created.`
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
  createdSourceFiles.push(relativePagePath)

  project.saveSync()

  Log.success(
    `The following files were created successfully: ${createdSourceFiles.join(', ')}`
  )
}
