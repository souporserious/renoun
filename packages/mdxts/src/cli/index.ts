#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { createServer, getPort } from '../project/server'
import { initializeImportMapFromCollections } from './initialize-import-map'

const [firstArgument, ...restArguments] = process.argv.slice(2)

process.env.WS_NO_BUFFER_UTIL = 'true'

const wss = createServer()
const usageMessage = `Usage:   mdxts <your-framework-args>\nExample: mdxts next dev`

if (firstArgument === undefined) {
  console.error(usageMessage)
  process.exit(1)
} else if (firstArgument === 'next' || firstArgument === 'waku') {
  initializeImportMapFromCollections()

  const subProcess = spawn(firstArgument, restArguments, {
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env,
      MDXTS_NEXT_JS: firstArgument === 'next' ? 'true' : 'false',
      MDXTS_WS_PORT: getPort(wss).toString(),
      MDXTS_THEME_PATH: 'nord',
    },
  })
  subProcess.on('close', (code) => {
    process.exit(code)
  })
} else {
  console.error(`Unknown command\n${usageMessage}`)
  process.exit(1)
}
