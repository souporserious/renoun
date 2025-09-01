#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { createServer } from '../project/server.js'
import { getDebugLogger } from '../utils/debug.js'

const [firstArgument, secondArgument, ...restArguments] = process.argv.slice(2)

if (firstArgument === 'help') {
  const usageMessage = `Usage:   renoun <your-framework-args>\nExample:   renoun next dev`
  console.log(usageMessage)
  process.exit(0)
}

/* Disable the buffer util for WebSocket. */
process.env['WS_NO_BUFFER_UTIL'] = 'true'

type Framework = 'next' | 'vite' | 'waku'

const projectRequire = createRequire(join(process.cwd(), 'package.json'))

function resolveFrameworkBinFile(framework: Framework): string {
  const packageJsonPath = projectRequire.resolve(`${framework}/package.json`)
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))
  let binRelativePath: string | undefined

  if (typeof packageJson.bin === 'string') {
    binRelativePath = packageJson.bin
  } else if (typeof packageJson.bin === 'object') {
    if (packageJson.bin[framework]) {
      binRelativePath = packageJson.bin[framework]
    } else {
      binRelativePath = Object.values(packageJson.bin).at(0) as
        | string
        | undefined
    }
  }

  if (!binRelativePath) {
    throw new Error(`Could not find "bin" for ${framework}`)
  }

  return projectRequire.resolve(
    `${framework}/${binRelativePath.replace(/^\.\//, '')}`
  )
}

if (
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

        subProcess = spawn(
          process.execPath,
          [
            resolveFrameworkBinFile(firstArgument as Framework),
            secondArgument,
            ...restArguments,
          ],
          {
            stdio: ['inherit', 'inherit', 'pipe'],
            shell: false,
            env: {
              ...process.env,
              RENOUN_SERVER_PORT: port,
              RENOUN_SERVER_ID: id,
            },
          }
        )

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
