import { extensionName } from './path.ts'
import { loadPrettier } from './load-package.ts'

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

export function hasSourceTextFormatterParser(
  filePath: string,
  language?: string
): boolean {
  return getPrettierParser(filePath, language) !== undefined
}

type Formatter = (
  sourceText: string,
  options: Record<string, unknown>
) => string

type PrettierModule = Awaited<ReturnType<typeof loadPrettier>>

let formatter: Formatter | null | undefined
let prettierModule: PrettierModule | undefined
let prettierLoadTask: Promise<void> | undefined
let formatterInitializationTask: Promise<void> | undefined
let formatterStateVersion = 0

async function ensurePrettierModuleLoaded(): Promise<PrettierModule> {
  if (prettierModule !== undefined) {
    return prettierModule
  }

  if (prettierLoadTask) {
    await prettierLoadTask
    return prettierModule ?? null
  }

  const task = (async () => {
    prettierModule = await loadPrettier()
  })()

  prettierLoadTask = task

  try {
    await task
  } finally {
    if (prettierLoadTask === task) {
      prettierLoadTask = undefined
    }
  }

  return prettierModule ?? null
}

async function initializeFormatter(filePath: string): Promise<void> {
  if (formatter !== undefined) {
    return
  }

  if (formatterInitializationTask) {
    await formatterInitializationTask
    return
  }

  const task = (async () => {
    const prettier = await ensurePrettierModuleLoaded()

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
      formatter = null
    }

    formatterStateVersion += 1
  })()

  formatterInitializationTask = task

  try {
    await task
  } finally {
    if (formatterInitializationTask === task) {
      formatterInitializationTask = undefined
    }
  }
}

export function prewarmSourceTextFormatterRuntime(): void {
  if (
    formatter !== undefined ||
    prettierModule !== undefined ||
    prettierLoadTask
  ) {
    return
  }

  void ensurePrettierModuleLoaded().catch(() => {})
}

export function prewarmSourceTextFormatter(filePath: string): void {
  if (formatter !== undefined || formatterInitializationTask) {
    return
  }

  void initializeFormatter(filePath).catch(() => {})
}

export function getSourceTextFormatterStateVersion(): number {
  return formatterStateVersion
}

/** Formats the provided source text using the installed formatter. */
export async function formatSourceText(
  filePath: string,
  sourceText: string,
  language?: string,
  requireFormatter?: boolean,
  options: {
    nonBlocking?: boolean
  } = {}
) {
  // TODO: Add support for other formatters like dprint and biome

  const parser = getPrettierParser(filePath, language)
  if (!parser && requireFormatter !== true) {
    return sourceText
  }

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
    if (options.nonBlocking) {
      prewarmSourceTextFormatter(filePath)
      return sourceText
    }

    await initializeFormatter(filePath)

    if (formatter === null) {
      // No installed Prettier; honor requirement if explicitly requested.
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
  }

  if (formatter) {
    if (parser) {
      return formatter(sourceText, { parser })
    }
  }

  return sourceText
}
