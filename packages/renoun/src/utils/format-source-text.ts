import resolvePackage from 'resolve'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

import { extensionName } from './path.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/** Attempts to load a package if it is installed. */
function loadPackage<Value>(name: string, getImport: () => any) {
  return new Promise<Value>((resolve, reject) => {
    resolvePackage(name, { basedir: __dirname }, function (error) {
      if (error) {
        // @ts-expect-error
        if (error.code !== 'MODULE_NOT_FOUND') {
          reject(error)
        }
      } else {
        resolve(getImport())
      }
    })
  })
}

const extensionToParser = {
  js: 'babel',
  jsx: 'babel',
  ts: 'typescript',
  tsx: 'typescript',
  typescript: 'typescript',
  json: 'json',
  css: 'css',
  scss: 'scss',
  less: 'less',
  html: 'html',
  vue: 'vue',
  angular: 'angular',
  md: 'markdown',
  yaml: 'yaml',
  yml: 'yaml',
  graphql: 'graphql',
  mdx: 'mdx',
}

/** Returns the prettier parser for the provided file path. */
function getPrettierParser(filePath: string, language?: string) {
  if (language) {
    const parser = extensionToParser[language as keyof typeof extensionToParser]
    if (parser) {
      return parser
    }
  }

  const extension = extensionName(filePath).slice(1)
  return extensionToParser[extension as keyof typeof extensionToParser]
}

/** Attempts to load the prettier package if it is installed. */
function loadPrettier() {
  return loadPackage<{
    format: (sourceText: string, options?: Record<string, unknown>) => string
    resolveConfig: (filename: string) => Promise<Record<string, unknown> | null>
  }>('prettier', () => import('prettier').then((module) => module.default))
}

let formatter: (sourceText: string, options?: Record<string, unknown>) => string

/** Formats the provided source text using the installed formatter. */
export async function formatSourceText(
  filePath: string,
  sourceText: string,
  language?: string
) {
  // TODO: Add support for other formatters like dprint and biome

  if (formatter === undefined) {
    const prettier = await loadPrettier()

    if (prettier) {
      const config = (await prettier.resolveConfig(filePath)) || {}
      const parser = getPrettierParser(filePath, language)

      if (parser) {
        config.parser = parser
      } else {
        config.filepath = filePath
      }

      if (config.printWidth === undefined) {
        config.printWidth = 80
      }

      formatter = (sourceText: string) => prettier.format(sourceText, config)
    }
  }

  if (formatter) {
    return formatter(sourceText)
  }

  return sourceText
}
