#!/usr/bin/env node
import { spawn } from 'node:child_process'

import { generateCollectionImportMap } from '../collections/import-maps.js'
import { createServer } from '../project/server.js'

const [firstArgument, secondArgument, ...restArguments] = process.argv.slice(2)

if (firstArgument === 'help') {
  const usageMessage = `Usage:   renoun <your-framework-args>\nExample:   renoun next dev`
  console.log(usageMessage)
  process.exit(0)
}

/* Disable the buffer util for WebSocket. */
process.env.WS_NO_BUFFER_UTIL = 'true'

/* Generate the initial import maps for all collections and then start the server. */
generateCollectionImportMap().then(() => {
  start()
})

function start() {
  if (firstArgument === 'next' || firstArgument === 'waku') {
    const isDev = secondArgument === undefined || secondArgument === 'dev'

    if (process.env.NODE_ENV === undefined) {
      process.env.NODE_ENV = isDev ? 'development' : 'production'
    }

    function runSubProcess() {
      const subProcess = spawn(
        firstArgument,
        [secondArgument, ...restArguments],
        {
          stdio: 'inherit',
          shell: true,
          env: {
            ...process.env,
            RENOUN_SERVER: 'true',
          },
        }
      )

      subProcess.on('close', (code) => {
        server.cleanup()
        process.exit(code)
      })
    }

    const server = createServer()
    runSubProcess()
  } else if (firstArgument === 'watch') {
    if (process.env.NODE_ENV === undefined) {
      process.env.NODE_ENV = 'development'
    }

    createServer()
  }
}
