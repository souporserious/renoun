#!/usr/bin/env node
import { installPackage } from '@antfu/install-pkg'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

async function init() {
  const packageJsonPath = join(process.cwd(), 'package.json')
  const nextConfigPath = join(process.cwd(), 'next.config.js')

  // Check for package.json
  if (!existsSync(packageJsonPath)) {
    console.error(
      'No package.json found. Please run this command in a Next.js project directory.'
    )
    process.exit(1)
  }

  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))

  if (!packageJson.dependencies.next) {
    console.error(
      'Next.js is not installed. Please install Next.js using `npx create-next-app@latest`'
    )
    process.exit(1)
  }

  if (!packageJson.dependencies.mdxts) {
    console.log('mdxts package not found. Installing mdxts...')

    await installPackage('mdxts')

    console.log('mdxts installed successfully.')
  }

  // Check for next.config.js
  if (!existsSync(nextConfigPath)) {
    console.log('Creating next.config.mjs and configuring mdxts plugin...')

    const nextConfigContent = `
import { createMdxtsPlugin } from 'mdxts/next'

const withMdxts = createMdxtsPlugin({
  theme: 'nord'
})

export default withMdxts()`.trim()

    writeFileSync(nextConfigPath, nextConfigContent)
    console.log('next.config.js created and configured successfully.')
  } else {
    // TODO: codemod next config
  }
}

init()
