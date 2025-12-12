#!/usr/bin/env node
import { spawn } from 'node:child_process'

import { createServer } from '../project/server.js'
import { getDebugLogger } from '../utils/debug.js'
import { runAppCommand } from './app.js'
import { resolveFrameworkBinFile, type Framework } from './framework.js'
import { runEjectCommand } from './eject.js'
import { reorderEntries } from './reorder.js'
import { runThemeCommand } from './theme.js'
import { runValidateCommand } from './validate.js'

const [firstArgument, secondArgument, ...restArguments] = process.argv.slice(2)

if (firstArgument === 'help') {
  const usageMessage =
    `Usage:   renoun <framework> <command>    Run a framework with renoun\n` +
    `         renoun dev                      Run a renoun app (auto-detect)\n` +
    `         renoun <app> dev                Run a specific renoun app\n` +
    `         renoun eject [app]              Eject a renoun app into your project\n` +
    `         renoun theme <path>             Prune a VS Code theme JSON file\n` +
    `         renoun validate [path|url]      Check for broken links\n` +
    `\n` +
    `Examples:\n` +
    `  renoun next dev              Run Next.js with renoun\n` +
    `  renoun dev                   Run auto-detected renoun app\n` +
    `  renoun @renoun/blog dev      Run @renoun/blog app\n` +
    `  renoun eject                 Eject app into your project`
  console.log(usageMessage)
  process.exit(0)
}

if (firstArgument === 'validate') {
  const args = [secondArgument, ...restArguments].filter(
    (value): value is string => typeof value === 'string'
  )
  await runValidateCommand(args)
  process.exit(process.exitCode ?? 0)
} else if (firstArgument === 'theme') {
  await runThemeCommand(secondArgument)
  process.exit(0)
} else if (firstArgument === 'dev' || firstArgument === 'build') {
  // Auto-detect app mode: `renoun dev` or `renoun build`
  // Forward all args as framework args (no app name detection in this mode)
  const forwardedArgs = [secondArgument, ...restArguments].filter(
    (value): value is string => typeof value === 'string'
  )
  await runAppCommand({
    command: firstArgument,
    args: forwardedArgs,
    autoDetect: true,
  })
  process.exit(process.exitCode ?? 0)
} else if (
  firstArgument === 'next' ||
  firstArgument === 'vite' ||
  firstArgument === 'waku'
) {
  let subProcess: ReturnType<typeof spawn> | undefined

  function cleanupAndExit(code: number) {
    getDebugLogger().info('CLI cleanup initiated', () => ({
      data: { exitCode: code, hasSubProcess: !!subProcess },
    }))

    if (subProcess) {
      const pid = subProcess?.pid ?? null
      getDebugLogger().debug('Terminating subprocess', () => ({
        data: { pid },
      }))
      subProcess.kill('SIGTERM')
    }
    process.exit(code)
  }

  const isProduction = secondArgument === 'build'

  if (process.env['NODE_ENV'] === undefined) {
    process.env['NODE_ENV'] = isProduction ? 'production' : 'development'
  }

  getDebugLogger().info('Starting renoun CLI', () => ({
    data: {
      framework: firstArgument,
      command: secondArgument,
      isProduction,
      nodeEnv: process.env['NODE_ENV'],
      debugEnabled:
        process.env['RENOUN_DEBUG'] !== undefined &&
        process.env['RENOUN_DEBUG'].toLowerCase() !== 'false',
    },
  }))

  async function runSubProcess() {
    return getDebugLogger().trackOperation(
      'cli.runSubProcess',
      async () => {
        const server = await createServer()
        const port = String(await server.getPort())
        const id = server.getId()

        getDebugLogger().info('renoun server created', () => ({
          data: { port, serverId: id },
        }))

        const frameworkBinPath = resolveFrameworkBinFile(
          firstArgument as Framework
        )
        const args = [frameworkBinPath]
        let command = secondArgument

        if (!command && firstArgument === 'next') {
          command = 'dev'
        }
        if (command) {
          args.push(command)
        }

        args.push(...restArguments)

        subProcess = spawn(process.execPath, args, {
          stdio: ['inherit', 'inherit', 'pipe'],
          shell: false,
          env: {
            ...process.env,
            RENOUN_SERVER_PORT: port,
            RENOUN_SERVER_ID: id,
          },
        })

        {
          const pid = subProcess?.pid ?? null
          getDebugLogger().info('Subprocess spawned', () => ({
            data: {
              pid,
              command: `${firstArgument} ${secondArgument}`,
            },
          }))
        }

        const fatalRE = /(FATAL ERROR|Allocation failed|heap limit)/i

        subProcess.stderr?.on('data', (buffer) => {
          const line = buffer.toString()
          getDebugLogger().error('Subprocess stderr', () => ({ data: line }))

          if (fatalRE.test(line)) {
            getDebugLogger().error(
              'Detected fatal stderr pattern - killing subprocess'
            )
            subProcess?.kill('SIGKILL')
          }

          process.stderr.write(buffer)
        })

        subProcess.on(
          'exit',
          (code: number | null, signal: NodeJS.Signals | null) => {
            {
              const pid = subProcess?.pid ?? null
              getDebugLogger().error('Subprocess exit', () => ({
                data: { pid, exitCode: code, signal },
              }))
            }
          }
        )

        subProcess.on('close', (code: number) => {
          const pid = subProcess?.pid ?? null
          getDebugLogger().info('Subprocess closed', () => ({
            data: { pid, exitCode: code },
          }))
          server.cleanup()
          cleanupAndExit(code)
        })

        subProcess.on('error', (error: Error) => {
          const pid = subProcess?.pid ?? null
          getDebugLogger().error('Subprocess error', () => ({
            data: { pid, error: error.message },
          }))
          server.cleanup()
          cleanupAndExit(1)
        })

        return server
      },
      { data: { framework: firstArgument, command: secondArgument } }
    )
  }

  await runSubProcess()

  process.on('SIGINT', () => {
    getDebugLogger().info('Received SIGINT signal')
    cleanupAndExit(0)
  })

  process.on('SIGTERM', () => {
    getDebugLogger().info('Received SIGTERM signal')
    cleanupAndExit(0)
  })

  process.on('uncaughtException', (error) => {
    getDebugLogger().error('Uncaught exception', () => ({
      data: { error: error.message, stack: error.stack },
    }))
    console.error('Uncaught exception:', error)
    cleanupAndExit(1)
  })

  process.on('unhandledRejection', (reason) => {
    getDebugLogger().error('Unhandled rejection', () => ({
      data: { reason: String(reason) },
    }))
    console.error('Unhandled rejection:', reason)
    cleanupAndExit(1)
  })
} else if (
  // App mode, app-first form: `renoun @renoun/docs dev`
  secondArgument === 'dev' ||
  secondArgument === 'build'
) {
  const appArgs = [firstArgument, ...restArguments].filter(
    (value): value is string => typeof value === 'string'
  )
  await runAppCommand({
    command: secondArgument as 'dev' | 'build',
    args: appArgs,
  })
  process.exit(process.exitCode ?? 0)
} else if (firstArgument === 'eject') {
  try {
    await runEjectCommand({ appName: secondArgument })
    process.exit(0)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(message)
    process.exit(1)
  }
} else if (firstArgument === 'reorder') {
  try {
    await reorderEntries(secondArgument)
    process.exit(0)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('Failed to reorder entries:', message)
    process.exit(1)
  }
} else if (firstArgument === 'watch') {
  if (process.env['NODE_ENV'] === undefined) {
    process.env['NODE_ENV'] = 'development'
  }

  getDebugLogger().info('Starting renoun watch mode', () => ({
    data: {
      nodeEnv: process.env['NODE_ENV'],
      debugEnabled:
        process.env['RENOUN_DEBUG'] !== undefined &&
        process.env['RENOUN_DEBUG'].toLowerCase() !== 'false',
    },
  }))

  getDebugLogger().trackOperation(
    'cli.watch',
    async () => {
      const server = await createServer()

      if (getDebugLogger().isEnabled('info')) {
        const port = await server.getPort()
        getDebugLogger().info('Watch server created', () => ({
          data: { port },
        }))
      }
      return server
    },
    { data: { mode: 'watch' } }
  )
}
