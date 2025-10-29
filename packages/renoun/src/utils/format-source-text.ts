import { extensionName } from './path.js'
import { loadPrettier } from './load-package.js'

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

type ParserExtension = keyof typeof extensionToParser

/** Returns the prettier parser for the provided file path. */
function getPrettierParser(filePath: string, language?: string) {
  if (language) {
    const parser = extensionToParser[language as ParserExtension]

    if (parser) {
      return parser
    }

    return undefined
  }

  const extension = extensionName(filePath).slice(1)
  return extensionToParser[extension as ParserExtension]
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
  language?: string,
  requireFormatter?: boolean
) {
  // TODO: Add support for other formatters like dprint and biome

  if (formatter === null) {
    if (requireFormatter) {
      throw new Error(
        `The \"shouldFormat\" option was explicitly enabled, but Prettier is not installed.\n` +
          `Install Prettier with one of the following commands:\n` +
          `  pnpm add -D prettier\n  npm i -D prettier\n  yarn add -D prettier\n` +
          `Or disable formatting by setting shouldFormat={false}.`
      )
    }
    return sourceText
  }

  if (formatter === undefined) {
    const prettier = await loadPrettier()

    if (prettier) {
      const config = (await prettier.resolveConfig(filePath)) || {}

      if (config['printWidth'] === undefined) {
        config['printWidth'] = 80
      }

      formatter = (sourceText: string, options: Record<string, unknown>) => {
        return prettier.format(sourceText, {
          ...config,
          ...options,
        })
      }
    } else {
      // No installed Prettier; honor requirement if explicitly requested.
      if (requireFormatter) {
        throw new Error(
          `The \"shouldFormat\" option was explicitly enabled, but Prettier is not installed.\n` +
            `Install Prettier with one of the following commands:\n` +
            `  pnpm add -D prettier\n  npm i -D prettier\n  yarn add -D prettier\n` +
            `Or disable formatting by setting shouldFormat={false}.`
        )
      }
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
