#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { Project } from 'ts-morph'

import {
  codemodNextJsConfig,
  codemodNextMjsConfig,
} from './codemod-next-config'

async function init() {
  const packageJsonPath = join(process.cwd(), 'package.json')

  if (!existsSync(packageJsonPath)) {
    console.error(
      'No package.json found. Please run this command in a Next.js project directory.'
    )
    process.exit(1)
  }

  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))

  if (!packageJson.devDependencies.next || !packageJson.dependencies.next) {
    console.error(
      'This package requires Next.js. Please install Next.js using `npx create-next-app@latest`'
    )
    process.exit(1)
  }

  const notifier = (await import('update-notifier')).default({
    pkg: packageJson,
  })

  if (notifier.update) {
    notifier.notify({
      message: `You're using an outdated version of mdxts.\nPlease run \`npm create mdxts@latest\` to use the latest version`,
    })
    process.exit(1)
  }

  if (!packageJson.dependencies.mdxts) {
    const { installPackage } = await import('@antfu/install-pkg')

    console.log(
      'mdxts package not found. Installing mdxts and required dependencies...'
    )

    await installPackage(['mdxts', 'shiki', 'prettier'])

    console.log('mdxts installed successfully!')
  }

  const nextConfigJsPath = join(process.cwd(), 'next.config.js')
  const nextConfigMjsPath = join(process.cwd(), 'next.config.mjs')
  const nextConfigPath = existsSync(nextConfigJsPath)
    ? nextConfigJsPath
    : nextConfigMjsPath

  if (!existsSync(nextConfigJsPath) && !existsSync(nextConfigMjsPath)) {
    console.log('Creating next.config.mjs and configuring mdxts plugin...')

    const nextConfigContent = `
import { createMdxtsPlugin } from 'mdxts/next'

const withMdxts = createMdxtsPlugin({
  theme: 'nord'
})

export default withMdxts()`.trim()

    writeFileSync(nextConfigMjsPath, nextConfigContent)

    console.log('next.config.mjs created and mdxts configured successfully!')
  } else {
    const project = new Project({ useInMemoryFileSystem: true })
    const sourceFile = project.createSourceFile(
      'index.ts',
      readFileSync(nextConfigPath, 'utf-8')
    )

    if (nextConfigPath.endsWith('.js')) {
      codemodNextJsConfig(sourceFile)
    } else {
      codemodNextMjsConfig(sourceFile)
    }

    writeFileSync(nextConfigPath, sourceFile.getFullText())

    console.log('mdxts configured successfully!')
  }
}

init()
