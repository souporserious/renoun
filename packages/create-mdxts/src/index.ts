#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
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

async function askYesNo(question: string, defaultYes = true) {
  const answer = await askQuestion(
    `${question} [${defaultYes ? 'Y/n' : 'y/N'}] `
  )
  return answer === '' ? defaultYes : answer.toLowerCase().startsWith('y')
}

function clearConsole() {
  process.stdout.write('\x1Bc')
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
}

const states = {
  INITIAL_STATE: 'initialState',
  CHECK_MDXTS_INSTALLED: 'checkMdxtsInstalled',
  CHECK_NEXT_CONFIG_EXISTS: 'checkNextConfigExists',
  CONFIGURE_NEXT_PLUGIN: 'configureNextPlugin',
  INSTALL_MDXTS: 'installMdxts',
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
            currentState = states.CONFIGURE_NEXT_PLUGIN
          } else {
            currentState = states.ERROR_STATE
            errorMessage = 'mdxts installation cancelled.'
          }
          currentState = states.CONFIGURE_NEXT_PLUGIN
          break
        case states.CHECK_NEXT_CONFIG_EXISTS:
          currentState = states.CONFIGURE_NEXT_PLUGIN
          context.configExists = checkNextJsConfigExists()
          break
        case states.CONFIGURE_NEXT_PLUGIN:
          const confirmConfig = await askYesNo(
            `Do you want to configure the ${chalk.bold(
              'mdxts/next'
            )} plugin now?`
          )
          if (confirmConfig) {
            await configureNextPlugin(context.configExists)
            currentState = states.SUCCESS_STATE
          } else {
            Log.info('Configuration skipped.')
            currentState = states.SUCCESS_STATE
          }
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
    clearConsole()
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
        'npm create next-app@latest'
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

const nextConfigContent = `
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
      const project = new Project({ useInMemoryFileSystem: true })
      const sourceFile = project.createSourceFile(
        'index.ts',
        readFileSync(nextConfigPath, 'utf-8')
      )
      if (nextConfigPath.endsWith('.js')) {
        codemodNextJsConfig(sourceFile)
      } else {
        codemodNextMjsConfig(sourceFile)
      }
      writeFileSync(nextConfigPath, sourceFile.getFullText())
    } else {
      writeFileSync(nextConfigMjsPath, nextConfigContent)
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
