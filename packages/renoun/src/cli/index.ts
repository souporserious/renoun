#!/usr/bin/env node
import { spawn } from 'node:child_process'
import {
  existsSync,
  writeFileSync,
  readFileSync,
  mkdirSync,
  unlinkSync,
} from 'node:fs'

import { createServer } from '../project/server.js'

const [firstArgument, secondArgument, ...restArguments] = process.argv.slice(2)

if (firstArgument === 'help') {
  const usageMessage = `Usage:   renoun <your-framework-args>\nExample:   renoun next dev`
  console.log(usageMessage)
  process.exit(0)
}

const configPath = 'renoun.json'

/** Handles downloading a theme from tm-themes on unpkg */
if (firstArgument === 'theme') {
  const response = await fetch(
    `https://unpkg.com/tm-themes/themes/${secondArgument}.json`
  )

  if (!response.ok) {
    throw new Error(`[renoun] The theme "${secondArgument}" does not exist.`)
  }

  const theme = await response.json()

  mkdirSync(`.renoun/themes`, { recursive: true })

  writeFileSync(
    `.renoun/themes/${secondArgument}.json`,
    JSON.stringify(theme, null, 2),
    'utf-8'
  )

  // Update renoun config with the new theme
  if (existsSync(configPath)) {
    const userConfig = JSON.parse(readFileSync(configPath, 'utf-8'))
    if (typeof userConfig.theme === 'object') {
      userConfig.theme[theme.type] = secondArgument
    } else {
      if (userConfig.theme) {
        const previousThemePath = `.renoun/themes/${userConfig.theme}.json`
        if (existsSync(previousThemePath)) {
          unlinkSync(previousThemePath)
        }
      }
      userConfig.theme = secondArgument
    }
    writeFileSync(configPath, JSON.stringify(userConfig, null, 2), 'utf-8')
  } else {
    writeFileSync(
      configPath,
      JSON.stringify(
        {
          $schema: 'https://renoun.dev/schema.json',
          theme: secondArgument,
        },
        null,
        2
      ),
      'utf-8'
    )
  }

  process.exit(0)
}

/** Handles downloading a language grammars from tm-grammars on unpkg */
if (firstArgument === 'language') {
  type GrammarCategory =
    | 'web'
    | 'markup'
    | 'general'
    | 'scripting'
    | 'data'
    | 'dsl'
    | 'utility'
    | 'config'
    | 'lisp'

  interface GrammarInfo {
    name: string
    displayName: string
    categories?: GrammarCategory[]
    scopeName: string
    source: string
    aliases?: string[]
    licenseUrl?: string
    license?: string
    sha: string
    lastUpdate: string
    embedded?: string[]
    embeddedIn?: string[]
    byteSize: number
    hash: string
  }

  // Fetch and parse all grammar metadata from tm-grammars
  const allGrammarsText = await (
    await fetch(`https://unpkg.com/tm-grammars/index.js`)
  ).text()
  const allGrammars = await import('vm').then(async ({ runInNewContext }) => {
    const result = { module: { exports: { grammars: [] } } }
    runInNewContext(
      allGrammarsText.replaceAll('export const ', 'module.exports.'),
      result
    )
    return result.module.exports.grammars as GrammarInfo[]
  })

  // Account for when the second argument is an alias and find the canonical name
  const grammar = allGrammars.find((grammar) => {
    return (
      grammar.aliases?.includes(secondArgument) ||
      grammar.name === secondArgument
    )
  })

  if (!grammar) {
    throw new Error(
      `[renoun] The language "${secondArgument}" grammar does not exist. Ensure the language is spelled correct and supported by tm-grammars: https://github.com/shikijs/textmate-grammars-themes/tree/main/packages/tm-grammars/grammars`
    )
  }

  const response = await fetch(
    `https://unpkg.com/tm-grammars/grammars/${grammar.name}.json`
  )

  mkdirSync(`.renoun/languages`, { recursive: true })

  writeFileSync(
    `.renoun/languages/${grammar.name}.json`,
    await response.text(),
    'utf-8'
  )

  // Update metadata for the language
  const previousMeta = existsSync(`.renoun/languages/meta.json`)
    ? JSON.parse(readFileSync(`.renoun/languages/meta.json`, 'utf-8'))
    : {}

  writeFileSync(
    `.renoun/languages/meta.json`,
    JSON.stringify({
      ...previousMeta,
      [grammar.scopeName]: [grammar.name].concat(grammar.aliases || []),
    })
  )

  // Update renoun config with the new language
  if (existsSync(configPath)) {
    const userConfig = JSON.parse(readFileSync(configPath, 'utf-8'))
    if (userConfig.languages) {
      if (!userConfig.languages.includes(grammar.name)) {
        userConfig.languages.push(grammar.name)
        writeFileSync(configPath, JSON.stringify(userConfig, null, 2), 'utf-8')
      }
    } else {
      writeFileSync(
        configPath,
        JSON.stringify(
          {
            $schema: 'https://renoun.dev/schema.json',
            ...userConfig,
            languages: [grammar.name],
          },
          null,
          2
        ),
        'utf-8'
      )
    }
  } else {
    writeFileSync(
      configPath,
      JSON.stringify(
        {
          $schema: 'https://renoun.dev/schema.json',
          languages: [grammar.name],
        },
        null,
        2
      ),
      'utf-8'
    )
  }

  process.exit(0)
}

// Syncs language grammars and themes from the renoun.json config
if (firstArgument === 'sync') {
  if (!existsSync(configPath)) {
    throw new Error(
      `[renoun] The renoun.json config file does not exist. Run "renoun init" to create a new config file.`
    )
  }

  const config = JSON.parse(readFileSync(configPath, 'utf-8'))

  if (config.theme) {
    const themeNames =
      typeof config.theme === 'string'
        ? [config.theme]
        : Object.values(config.theme)

    for (const themeName of themeNames) {
      const response = await fetch(
        `https://unpkg.com/tm-themes/themes/${themeName}.json`
      )

      if (!response.ok) {
        throw new Error(`[renoun] The theme "${themeName}" does not exist.`)
      }

      const theme = await response.json()

      mkdirSync(`.renoun/themes`, { recursive: true })

      writeFileSync(
        `.renoun/themes/${themeName}.json`,
        JSON.stringify(theme, null, 2),
        'utf-8'
      )
    }
  }

  if (config.languages) {
    for (const language of config.languages) {
      const response = await fetch(
        `https://unpkg.com/tm-grammars/grammars/${language}.json`
      )

      mkdirSync(`.renoun/languages`, { recursive: true })

      writeFileSync(
        `.renoun/languages/${language}.json`,
        await response.text(),
        'utf-8'
      )
    }
  }
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
