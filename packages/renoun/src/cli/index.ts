#!/usr/bin/env node
import { spawn } from 'node:child_process'

import { createServer } from '../project/server.js'

const [firstArgument, secondArgument, ...restArguments] = process.argv.slice(2)

if (firstArgument === 'help') {
  const usageMessage = `Usage:   renoun <your-framework-args>\nExample:   renoun next dev`
  console.log(usageMessage)
  process.exit(0)
}

/* Disable the buffer util for WebSocket. */
process.env.WS_NO_BUFFER_UTIL = 'true'

if (firstArgument === 'next' || firstArgument === 'waku') {
  let subProcess: ReturnType<typeof spawn> | undefined

  function cleanupAndExit(code: number) {
    if (subProcess) {
      subProcess.kill('SIGTERM')
    }
    process.exit(code)
  }

  const isProduction = secondArgument === 'build'

  if (process.env.NODE_ENV === undefined) {
    process.env.NODE_ENV = isProduction ? 'production' : 'development'
  }

  async function runSubProcess() {
    const port = String(await server.getPort())

    subProcess = spawn(firstArgument, [secondArgument, ...restArguments], {
      stdio: 'inherit',
      shell: true,
      env: {
        ...process.env,
        RENOUN_SERVER_PORT: port,
      },
    })

    subProcess.on('close', (code: number) => {
      server.cleanup()
      cleanupAndExit(code)
    })
  }

  const server = await createServer()

  await runSubProcess()

  // Handle Ctrl+C
  process.on('SIGINT', () => cleanupAndExit(0))

  // Handle kill commands
  process.on('SIGTERM', () => cleanupAndExit(0))

  process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error)
    cleanupAndExit(1)
  })
} else if (firstArgument === 'watch') {
  if (process.env.NODE_ENV === undefined) {
    process.env.NODE_ENV = 'development'
  }

  createServer()
}
