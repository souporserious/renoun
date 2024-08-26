#!/usr/bin/env node
import { spawn } from 'node:child_process'

import { generateCollectionImportMap } from '../collections/import-maps'
import { createServer } from '../project/server'

const [firstArgument, secondArgument, ...restArguments] = process.argv.slice(2)

if (firstArgument === 'help') {
  const usageMessage = `Usage:   mdxts <your-framework-args>\nExample:   mdxts next dev`
  console.log(usageMessage)
  process.exit(0)
}

generateCollectionImportMap()

/* Disable the buffer util for WebSocket. */
process.env.WS_NO_BUFFER_UTIL = 'true'

if (firstArgument === 'next' || firstArgument === 'waku') {
  const isDev = secondArgument === undefined || secondArgument === 'dev'

  if (process.env.NODE_ENV === undefined) {
    // @ts-expect-error
    process.env.NODE_ENV = isDev ? 'development' : 'production'
  }

  const runSubProcess = () => {
    const subProcess = spawn(
      firstArgument,
      [secondArgument, ...restArguments],
      {
        stdio: 'inherit',
        shell: true,
        env: {
          ...process.env,
          MDXTS_SERVER: 'true',
        },
      }
    )

    subProcess.on('close', (code) => {
      if (!isDev) {
        server.cleanup()
        process.exit(code)
      }
    })
  }
  const server = createServer()

  runSubProcess()
} else if (firstArgument === 'watch') {
  if (process.env.NODE_ENV === undefined) {
    // @ts-expect-error
    process.env.NODE_ENV = 'development'
  }

  createServer()
}
