import resolvePackage from 'resolve'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

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

/** Attempts to load the prettier package if it is installed. */
function loadPrettier() {
  return loadPackage<{
    format: (sourceText: string, options?: Record<string, unknown>) => string
    resolveConfig: (filename: string) => Promise<Record<string, unknown> | null>
  }>('prettier', () => import('prettier').then((module) => module.default))
}

let formatter: (sourceText: string, options?: Record<string, unknown>) => string

/**
 * Formats the provided source text using the installed formatter.
 * TODO: Add support for other formatters like dprint and biome
 */
export async function formatSourceText(filePath: string, sourceText: string) {
  if (formatter === undefined) {
    const prettier = await loadPrettier()

    if (prettier) {
      const config = (await prettier.resolveConfig(filePath)) || {}

      config.filepath = filePath

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
