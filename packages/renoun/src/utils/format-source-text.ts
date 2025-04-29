import { createRequire } from 'node:module'

import { findPackageDependency } from './find-package-dependency.js'
import { extensionName } from './path.js'

const require = createRequire(import.meta.url)

/** Attempts to load a package if it is installed. */
async function loadPackage<Value>(name: string, getImport: () => any) {
  const hasPackage = await findPackageDependency(name)
  return hasPackage ? (getImport() as Value) : null
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
    resolveConfig: (fileName: string) => Promise<Record<string, unknown> | null>
  }>('prettier', () => require('prettier'))
}

type Formatter = (
  sourceText: string,
  options: Record<string, unknown>
) => string

let formatter: Formatter | null | undefined

/** Formats the provided source text using the installed formatter. */
export async function formatSourceText(
  filePath: string,
  sourceText: string,
  language?: string
) {
  // TODO: Add support for other formatters like dprint and biome

  if (formatter === null) {
    return sourceText
  }

  if (formatter === undefined) {
    const prettier = await loadPrettier()

    if (prettier) {
      const config = (await prettier.resolveConfig(filePath)) || {}

      if (config.printWidth === undefined) {
        config.printWidth = 80
      }

      formatter = (sourceText: string, options: Record<string, unknown>) => {
        return prettier.format(sourceText, {
          ...config,
          ...options,
        })
      }
    } else {
      // No parser found for the provided language, use the default formatter.
      formatter = null
    }
  }

  if (formatter) {
    const parser = getPrettierParser(filePath, language)

    if (parser) {
      return formatter(sourceText, { parser })
    }
  }

  return sourceText
}
