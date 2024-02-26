#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { extname, join, sep } from 'node:path'
import { Project } from 'ts-morph'
import chalk from 'chalk'

import { addGitSourceToMdxtsConfig } from './add-git-source-to-mdxts-config'
import {
  codemodNextJsConfig,
  codemodNextMjsConfig,
} from './codemod-next-config'
import { fetchExample } from './fetch-example'
import { getNextJsDevPort } from './get-next-js-dev-port'
import { gitRemoteUrlToHttp } from './git-remote-url-to-http'
import { isPackageOutdated } from './is-package-outdated'
import { Log, askQuestion, askYesNo, getFilePatternBaseName } from './utils'

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

  if (await isPackageOutdated()) {
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
          checkNextJsProject()
          currentState = states.CHECK_TYPESCRIPT_INSTALLED
          break
        case states.CHECK_TYPESCRIPT_INSTALLED:
          if (checkTypeScriptInstalled()) {
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
          if (checkMdxtsInstalled()) {
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
              description: `This should be a collection of MDX and/or TypeScript files.`,
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

export function checkNextJsProject() {
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

export function checkTypeScriptInstalled() {
  const tsconfigPath = join(process.cwd(), 'tsconfig.json')
  const packageJsonPath = join(process.cwd(), 'package.json')
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))
  return Boolean(
    existsSync(tsconfigPath) ||
      packageJson.devDependencies?.typescript ||
      packageJson.dependencies?.typescript
  )
}

export function checkNextMdxInstalled() {
  const nextConfig = readFileSync(getNextConfigPath()!, 'utf-8')
  return nextConfig.includes('@next/mdx')
}

export function checkMdxtsInstalled() {
  const packageJsonPath = join(process.cwd(), 'package.json')
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))
  return Boolean(
    packageJson.devDependencies?.mdxts || packageJson.dependencies?.mdxts
  )
}

let nextConfigPath: string | null = null

export function getNextConfigPath() {
  const nextConfigJsPath = join(process.cwd(), 'next.config.js')
  if (existsSync(nextConfigJsPath)) {
    nextConfigPath = nextConfigJsPath
  }
  const nextConfigMjsPath = join(process.cwd(), 'next.config.mjs')
  if (existsSync(nextConfigMjsPath)) {
    nextConfigPath = nextConfigMjsPath
  }
  return nextConfigPath
}

export function checkNextJsConfigExists() {
  return Boolean(getNextConfigPath())
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
      if (checkNextMdxInstalled()) {
        throw new Error(
          'The @next/mdx package is handled by mdxts/next. Please remove @next/mdx from your next config before running this command again.'
        )
      }

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

    /** Attempt to resolve the git source from the git remote URL and add it to the next config file. */
    const gitRemoteOriginUrl = (await import('git-remote-origin-url')).default
    let remoteOriginUrl

    try {
      remoteOriginUrl = await gitRemoteOriginUrl()
    } catch (error) {
      Log.warning(
        `Unable to resolve a git remote URL for the ${chalk.bold('gitSource')} mdxts/next plugin option: ${error}`
      )
    }

    if (remoteOriginUrl) {
      const httpUrl = gitRemoteUrlToHttp(remoteOriginUrl)
      const shouldAddGitSource = await askYesNo(
        `Configure ${chalk.bold(httpUrl)} as the git source for the mdxts plugin?`,
        {
          description: 'This will be the url used to link back to source code.',
        }
      )
      if (shouldAddGitSource) {
        addGitSourceToMdxtsConfig(httpUrl)
      }
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

  const dataIdentifier = getFilePatternBaseName(sourcePathInput) ?? 'dataSource'
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
  const baseSourcePath = join(
    process.cwd(),
    'app',
    hasSourceDirectory ? join('src', dataIdentifier) : dataIdentifier
  )
  const collectionPagePath = join(baseSourcePath, 'page.tsx')
  const collectionPage = `
import { Navigation } from 'mdxts/components'
import Link from 'next/link'
import { ${allDataIdentifier} } from '${hasSourceDirectory ? '../' : ''}../../data'

// The \`Navigation\` component renders a nested list of links to all ${dataIdentifier}.

export default function Page() {
  return (
    <Navigation
      source={${allDataIdentifier}}
      renderList={(props) => <ul>{props.children}</ul>}
      renderItem={(props) => (
        <li key={props.pathname}>
          <Link href={props.pathname}>{props.label}</Link>
          {props.children}
        </li>
      )}
    />
  )
}

// Alternatively, render the navigation links yourself with the \`tree\` method:

// function renderLinks(items: ReturnType<typeof ${allDataIdentifier}.tree>) {
//   return items.map((item) => (
//     <li key={item.pathname}>
//       <Link href={item.pathname}>{item.label}</Link>
//       {item.children.length ? <ul>{renderLinks(item.children)}</ul> : null}
//     </li>
//   ))
// }

// export default function Page() {
//   return <ul>{renderLinks(${allDataIdentifier}.tree())}</ul>
// }
`.trim()

  project.createSourceFile(collectionPagePath, collectionPage)
  createdSourceFiles.push(collectionPagePath.replace(process.cwd() + sep, ''))

  const sourcePagePath = join(baseSourcePath, '[slug]', 'page.tsx')
  const relativePagePath = sourcePagePath.replace(process.cwd() + sep, '')
  const sourcePage = `
import { notFound } from 'next/navigation'
import { ${allDataIdentifier} } from '${hasSourceDirectory ? '../' : ''}../../../data'

export function generateStaticParams() {
  return (
    ${allDataIdentifier}.paths().map((pathname) => ({
      // Use last part of pathname as the slug. Pass \`baseDirectory\` as an option to \`createSource\` to remove the source directory from the slug.
      slug: pathname.slice(-1).at(0)
    }))
  )
}

export default async function Page({ params }: { params: { slug: string } }) {
  const ${singularDataIdentifier} = await ${allDataIdentifier}.get(\`${dataIdentifier}/\${params.slug\}\`)

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

  const pageFile = project.addSourceFileAtPathIfExists(sourcePagePath)
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

  project.createSourceFile(sourcePagePath, sourcePage, {
    overwrite: true,
  })
  createdSourceFiles.push(relativePagePath)

  project.saveSync()

  const port = getNextJsDevPort()
  const portUrl = chalk.bold(`http://localhost:${port}/${dataIdentifier}`)
  const portMessage = `After starting the Next.js development server you can now visit ${portUrl} to view the rendered source collection and item pages.`

  Log.success(
    `The following files were created successfully: \n${chalk.bold(createdSourceFiles.map((file) => `- ${file}`).join('\n'))}\n\n${portMessage}`
  )
}
