#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { watch } from 'node:fs'
import { Project } from 'ts-morph'

import { createServer } from '../project/server'
import { initializeImportMapFromCollections } from './initialize-import-map'

const [firstArgument, secondArgument, ...restArguments] = process.argv.slice(2)

if (firstArgument === 'help') {
  const usageMessage = `Usage:   mdxts <your-framework-args>\nExample:   mdxts next dev`
  console.log(usageMessage)
  process.exit(0)
}

const project = new Project({
  skipAddingFilesFromTsConfig: true,
  tsConfigFilePath: 'tsconfig.json',
})

initializeImportMapFromCollections(project)

if (firstArgument === undefined) {
  process.exit(0)
}

if (firstArgument === 'next' || firstArgument === 'waku') {
  const isDev = secondArgument === undefined || secondArgument === 'dev'
  const runSubProcess = () => {
    const subProcess = spawn(
      firstArgument,
      [secondArgument, ...restArguments].filter(
        (argument) => argument !== '--watch'
      ),
      {
        stdio: 'inherit',
        shell: true,
        env: {
          ...process.env,
          MDXTS_NEXT_JS: firstArgument === 'next' ? 'true' : 'false',
          MDXTS_WS_PORT: server ? server.getPort().toString() : '',
        },
      }
    )
    subProcess.on('close', (code) => {
      if (!isDev) {
        process.exit(code)
      }
    })
  }
  let server: ReturnType<typeof createServer> | undefined

  if (isDev) {
    process.env.WS_NO_BUFFER_UTIL = 'true'
    server = createServer()
  }

  runSubProcess()
} else if (firstArgument === '--watch') {
  const ignoredFiles = ['.mdxts', '.next']

  watch(process.cwd(), { recursive: true }, (_, filename) => {
    if (ignoredFiles.some((ignoredFile) => filename?.startsWith(ignoredFile))) {
      return
    }
    initializeImportMapFromCollections(project)
  })
}
