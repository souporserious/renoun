#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import chalk from 'chalk'

import { fetchExample } from '../fetch-example.js'
import { isPackageOutdated } from '../is-package-outdated.js'
import { pickExample } from '../pick-example.js'
import { askYesNo, Log } from '../utils.js'

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

  console.log(
    `Welcome to ${chalk.bold(chalk.yellow('renoun'))}!\nThe Documentation Toolkit for React`
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
            const installCommand = chalk.bold('npm create renoun@latest')
            Log.warning(
              `A new version of ${chalk.bold(
                'create-renoun'
              )} is available. Please use the latest version by running ${installCommand}.`
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
          const terminalLink = (await import('terminal-link')).default
          const example = await pickExample({
            options: ['blog', 'design-system'],
          })
          const exampleLink = terminalLink(
            example,
            `https://github.com/souporserious/renoun/tree/main/examples/${example}`
          )
          await fetchExample(
            example,
            `Download the ${exampleLink} example to ${chalk.bold(
              join(process.cwd(), example)
            )}?`
          )
          currentState = states.SUCCESS_STATE
          break
        }

        /**
         * - If renoun is missing, go to INSTALL_RENOUN.
         * - Otherwise, go to SUCCESS_STATE.
         */
        case states.CHECK_RENOUN_INSTALLED: {
          if (!checkRenounInstalled()) {
            const isYes = await askYesNo(
              `The ${chalk.bold('renoun')} package is not installed. Would you like to install it now?`
            )

            if (isYes) {
              currentState = states.INSTALL_RENOUN
            } else {
              context.message = `Please install the ${chalk.bold('renoun')} package before continuing.`
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
    Log.success('renoun configured successfully!')
  } else if (currentState === states.WARNING_STATE) {
    Log.warning(context.message)
  } else {
    Log.error(context.message)
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
  const { installPackage } = await import('@antfu/install-pkg')
  Log.info(`Installing ${chalk.bold('renoun')}...`)

  try {
    await installPackage(['renoun'])
    Log.success('renoun package installed successfully!')
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Installing renoun failed: ${error.message}`)
    }
  }
}
