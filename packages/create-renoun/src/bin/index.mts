#!/usr/bin/env node

import { installPackage } from '@antfu/install-pkg'
import {
  intro,
  outro,
  spinner,
  confirm,
  cancel,
  isCancel,
  select,
  log,
} from '@clack/prompts'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import color from 'picocolors'
import terminalLink from 'terminal-link'

import { fetchExample } from '../fetch-example.js'
import { isPackageOutdated } from '../is-package-outdated.js'

const states = {
  INITIAL_STATE: 'initialState',
  CHECK_OUTDATED: 'checkOutdated',
  CHECK_EXAMPLE: 'checkExample',
  CHECK_PACKAGE_JSON: 'checkPackageJson',
  PICK_EXAMPLE: 'pickExample',
  CHECK_RENOUN_INSTALLED: 'checkRenounInstalled',
  INSTALL_RENOUN: 'installRenoun',
  SUCCESS_STATE: 'successState',
  WARNING_STATE: 'warningState',
  ERROR_STATE: 'errorState',
}

export async function start() {
  const context = { message: '' }
  let currentState = states.INITIAL_STATE

  intro(
    `${color.bgYellowBright(color.bold(color.black('renoun')))} The Documentation Toolkit for React`
  )

  while (
    currentState !== states.SUCCESS_STATE &&
    currentState !== states.WARNING_STATE &&
    currentState !== states.ERROR_STATE
  ) {
    try {
      switch (currentState) {
        case states.INITIAL_STATE:
          currentState = states.CHECK_OUTDATED
          break

        /**
         * - If create-renoun is outdated, print a warning.
         * - Then proceed to CHECK_EXAMPLE.
         */
        case states.CHECK_OUTDATED: {
          if (await isPackageOutdated('create-renoun')) {
            log.warn(
              `A new version of ${color.bold('create-renoun')} is available. Please use the latest version by running ${color.bold('npm create renoun@latest')}.`
            )
          }
          currentState = states.CHECK_EXAMPLE
          break
        }

        /**
         * - If the user passed "--example <slug>", clone that example and go to SUCCESS_STATE.
         * - Otherwise, proceed to CHECK_PACKAGE_JSON.
         */
        case states.CHECK_EXAMPLE: {
          const args = process.argv
          const exampleIndex = args.indexOf('--example')
          if (exampleIndex !== -1 && args[exampleIndex + 1]) {
            const exampleSlug = args[exampleIndex + 1]
            await fetchExample(exampleSlug)
            currentState = states.SUCCESS_STATE
          } else {
            currentState = states.CHECK_PACKAGE_JSON
          }
          break
        }

        /**
         * - If no package.json is found, move to PICK_EXAMPLE.
         * - Otherwise, check if renoun is installed.
         */
        case states.CHECK_PACKAGE_JSON: {
          const packageJsonPath = join(process.cwd(), 'package.json')
          if (existsSync(packageJsonPath)) {
            currentState = states.CHECK_RENOUN_INSTALLED
          } else {
            currentState = states.PICK_EXAMPLE
          }
          break
        }

        /**
         * - No package.json found, so offer to download an example.
         * - After fetching, go directly to SUCCESS_STATE.
         */
        case states.PICK_EXAMPLE: {
          const example = await select({
            message: 'Choose an example below to get started:',
            options: [
              { value: 'blog', label: 'Blog' },
              { value: 'docs', label: 'Documentation' },
              { value: 'design-system', label: 'Design System' },
            ],
          })

          if (isCancel(example)) {
            context.message = 'Example selection cancelled.'
            currentState = states.WARNING_STATE
            break
          }

          const exampleLink = terminalLink(
            example,
            `https://github.com/souporserious/renoun/tree/main/examples/${example}`
          )
          const fetched = await fetchExample(
            example,
            `Download the ${color.underline(
              exampleLink
            )} example to ${color.bold(join(process.cwd(), example))}?`
          )

          if (fetched) {
            currentState = states.SUCCESS_STATE
          } else {
            context.message = `Example download exited. Please download an example or install renoun manually to continue.`
            currentState = states.WARNING_STATE
          }
          break
        }

        /**
         * - If renoun is missing, go to INSTALL_RENOUN.
         * - Otherwise, go to SUCCESS_STATE.
         */
        case states.CHECK_RENOUN_INSTALLED: {
          if (!checkRenounInstalled()) {
            const isYes = await confirm({
              message: `The ${color.bold('renoun')} package is not installed. Would you like to install it now?`,
            })

            if (isCancel(isYes)) {
              context.message = `Installation cancelled. Please install renoun manually.`
              currentState = states.WARNING_STATE
              break
            }

            if (isYes) {
              currentState = states.INSTALL_RENOUN
            } else {
              context.message = `Please install the ${color.bold('renoun')} package before continuing.`
              currentState = states.WARNING_STATE
            }
          } else {
            currentState = states.SUCCESS_STATE
          }
          break
        }

        /**
         * - Install renoun and go to SUCCESS_STATE.
         */
        case states.INSTALL_RENOUN:
          await installRenoun()
          currentState = states.SUCCESS_STATE
          break

        default:
          throw new Error(`State "${currentState}" does not exist`)
      }
    } catch (error) {
      if (error instanceof Error) {
        context.message = error.message
      }
      currentState = states.ERROR_STATE
    }
  }

  if (currentState === states.SUCCESS_STATE) {
    outro('renoun configured successfully!')
  } else if (currentState === states.WARNING_STATE) {
    log.warn(context.message)
  } else {
    cancel(context.message)
    process.exit(1)
  }
}

start()

/**
 * Check if renoun is already installed in dependencies or devDependencies
 */
function checkRenounInstalled() {
  const packageJsonPath = join(process.cwd(), 'package.json')
  if (!existsSync(packageJsonPath)) return false

  const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))
  return Boolean(pkg.dependencies?.renoun || pkg.devDependencies?.renoun)
}

/**
 * Install renoun using @antfu/install-pkg
 */
async function installRenoun() {
  const loader = spinner()

  loader.start(`Installing ${color.bold('renoun')}...`)

  try {
    await installPackage(['renoun'])
    loader.stop(`${color.bold('renoun')} installed successfully!`)
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to install renoun: ${error.message}`)
    }
  }
}
