#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { Project } from 'ts-morph'

import { createServer } from '../project/server'
import { generateCollectionImportMap } from '../collections/import-maps'

const [firstArgument, secondArgument, ...restArguments] = process.argv.slice(2)

if (firstArgument === 'help') {
  const usageMessage = `Usage:   mdxts <your-framework-args>\nExample:   mdxts next dev`
  console.log(usageMessage)
  process.exit(0)
}

const project = new Project({ tsConfigFilePath: 'tsconfig.json' })

generateCollectionImportMap(project)

if (firstArgument === undefined) {
  process.exit(0)
}

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
      { stdio: 'inherit', shell: true }
    )

    subProcess.on('close', (code) => {
      if (!isDev) {
        process.exit(code)
      }
    })
  }

  if (isDev) {
    createServer()
  }

  runSubProcess()
} else if (firstArgument === 'watch') {
  if (process.env.NODE_ENV === undefined) {
    // @ts-expect-error
    process.env.NODE_ENV = 'development'
  }

  createServer()
}
