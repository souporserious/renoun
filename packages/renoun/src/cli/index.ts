#!/usr/bin/env node
import { spawn } from 'node:child_process'

import { createServer } from '../project/server.js'
import { debug } from '../utils/debug.js'

const [firstArgument, secondArgument, ...restArguments] = process.argv.slice(2)

if (firstArgument === 'help') {
  const usageMessage = `Usage:   renoun <your-framework-args>\nExample:   renoun next dev`
  console.log(usageMessage)
  process.exit(0)
}

/* Disable the buffer util for WebSocket. */
process.env['WS_NO_BUFFER_UTIL'] = 'true'

if (firstArgument === 'next' || firstArgument === 'waku') {
  let subProcess: ReturnType<typeof spawn> | undefined

  function cleanupAndExit(code: number) {
    debug.info('CLI cleanup initiated', {
      data: { exitCode: code, hasSubProcess: !!subProcess },
    })

    if (subProcess) {
      debug.debug('Terminating subprocess', { data: { pid: subProcess.pid } })
      subProcess.kill('SIGTERM')
    }
    process.exit(code)
  }

  const isProduction = secondArgument === 'build'

  if (process.env['NODE_ENV'] === undefined) {
    process.env['NODE_ENV'] = isProduction ? 'production' : 'development'
  }

  debug.info('Starting renoun CLI', {
    data: {
      framework: firstArgument,
      command: secondArgument,
      isProduction,
      nodeEnv: process.env['NODE_ENV'],
      debugEnabled: process.env['RENOUN_DEBUG'] === 'true',
    },
  })

  async function runSubProcess() {
    return debug.trackAsyncOperation(
      'cli.runSubProcess',
      async () => {
        const server = await createServer()
        const port = String(await server.getPort())
        debug.info('renoun server created', {
          data: { port, serverId: process.env['RENOUN_SERVER_ID'] },
        })

        subProcess = spawn(firstArgument, [secondArgument, ...restArguments], {
          stdio: ['inherit', 'inherit', 'pipe'],
          shell: true,
          env: {
            ...process.env,
            RENOUN_SERVER_PORT: port,
          },
        })

        debug.info('Subprocess spawned', {
          data: {
            pid: subProcess.pid,
            command: `${firstArgument} ${secondArgument}`,
          },
        })

        const fatalRE = /(FATAL ERROR|Allocation failed|heap limit)/i

        subProcess.stderr?.on('data', (buf) => {
          const line = buf.toString()
          debug.error('Subprocess stderr', { data: line })

          if (fatalRE.test(line)) {
            debug.error('Detected fatal stderr pattern - killing subprocess')
            subProcess?.kill('SIGKILL')
          }
        })

        subProcess.on(
          'exit',
          (code: number | null, signal: NodeJS.Signals | null) => {
            debug.error('Subprocess exit', {
              data: { pid: subProcess?.pid, exitCode: code, signal },
            })
          }
        )

        subProcess.on('close', (code: number) => {
          debug.info('Subprocess closed', {
            data: { pid: subProcess?.pid, exitCode: code },
          })
          server.cleanup()
          cleanupAndExit(code)
        })

        subProcess.on('error', (error: Error) => {
          debug.error('Subprocess error', {
            data: { pid: subProcess?.pid, error: error.message },
          })
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
    debug.info('Received SIGINT signal')
    cleanupAndExit(0)
  })

  process.on('SIGTERM', () => {
    debug.info('Received SIGTERM signal')
    cleanupAndExit(0)
  })

  process.on('uncaughtException', (error) => {
    debug.error('Uncaught exception', {
      data: { error: error.message, stack: error.stack },
    })
    console.error('Uncaught exception:', error)
    cleanupAndExit(1)
  })

  process.on('unhandledRejection', (reason) => {
    debug.error('Unhandled rejection', { data: { reason: String(reason) } })
    console.error('Unhandled rejection:', reason)
    cleanupAndExit(1)
  })
} else if (firstArgument === 'watch') {
  if (process.env['NODE_ENV'] === undefined) {
    process.env['NODE_ENV'] = 'development'
  }

  debug.info('Starting renoun watch mode', {
    data: {
      nodeEnv: process.env['NODE_ENV'],
      debugEnabled: process.env['RENOUN_DEBUG'] === 'true',
    },
  })

  debug.trackAsyncOperation(
    'cli.watch',
    async () => {
      const server = await createServer()
      debug.info('Watch server created', {
        data: { port: await server.getPort() },
      })
      return server
    },
    { data: { mode: 'watch' } }
  )
}
