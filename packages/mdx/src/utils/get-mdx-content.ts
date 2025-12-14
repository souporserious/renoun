import * as jsxRuntime from 'react/jsx-runtime'
import * as jsxDevRuntime from 'react/jsx-dev-runtime'
import type { CompileOptions } from '@mdx-js/mdx'
import type { MDXContent } from 'mdx/types.js'
import type { VFileMessage } from 'vfile-message'

export interface MDXContentOptions<
  Scope extends Record<string, any> = Record<string, any>,
> {
  /** The MDX source string to compile. */
  source: string

  /** Values that will be available to the MDX source code during evaluation. */
  dependencies?: Scope

  /** Remark plugins to run during compilation. */
  remarkPlugins?: CompileOptions['remarkPlugins']

  /** Rehype plugins to run during compilation. */
  rehypePlugins?: CompileOptions['rehypePlugins']

  /** Base URL to resolve imports and named exports from (e.g. `import.meta.url`). */
  baseUrl?: string
}

/** Compile MDX into executable content using the provided runtime configuration. */
export async function getMDXContent<FileExports extends Record<string, any>>({
  source,
  dependencies,
  remarkPlugins,
  rehypePlugins,
  baseUrl,
}: MDXContentOptions<FileExports>): Promise<
  { default: MDXContent } & FileExports
> {
  try {
    const { evaluate } = await import('@mdx-js/mdx')
    const result = await evaluate(source, {
      development: process.env.NODE_ENV === 'development',
      baseUrl,
      rehypePlugins,
      remarkPlugins,
      ...(process.env.NODE_ENV === 'development' ? jsxDevRuntime : jsxRuntime),
      ...dependencies,
    })
    return result as { default: MDXContent } & FileExports
  } catch (error: unknown) {
    let messages: VFileMessage[] = []

    if (error instanceof Error) {
      if ('file' in error && Array.isArray((error as any).file.messages)) {
        messages = (error as any).file.messages
      } else if ('line' in error && 'column' in error && 'message' in error) {
        messages = [error as VFileMessage]
      }

      if (messages.length) {
        throwMDXErrors(undefined, source, messages)
      }

      throw new Error(
        `[renoun] Unexpected error compiling MDX:\n\n${error.message}`,
        { cause: error }
      )
    } else {
      throw error
    }
  }
}

/** Throw a single Error summarizing all MDX errors. */
function throwMDXErrors(
  fileName: string | undefined,
  source: string,
  messages: VFileMessage[]
) {
  const heading = fileName ? ` in "${fileName}"` : ''
  const summary = messages
    .map((message) => {
      return ` ⓧ ${message.reason ?? message.message} [Ln ${message.line}, Col ${message.column}]`
    })
    .join('\n')
  const snippet = vfileMessagesToPlainText(source, messages)
  const hint = `You can fix these by correcting the MDX syntax at the indicated lines/columns.`
  const errorQuantity = messages.length === 1 ? 'error' : 'errors'

  throw new Error(
    `[renoun] MDX compilation failed${heading} with the following ${errorQuantity}:\n\n` +
      `${summary}\n\n` +
      `${snippet}\n` +
      `${hint}`
  )
}

/** Render each source line with carets under any error columns. */
function vfileMessagesToPlainText(
  source: string,
  messages: VFileMessage[]
): string {
  const lines = source.split(/\r?\n/)
  const maxDigits = String(lines.length).length
  let out = ''

  for (let index = 0; index < lines.length; index++) {
    const lineNumber = index + 1
    const text = lines[index]
    const label = String(lineNumber).padStart(maxDigits, ' ')
    out += `${label} | ${text}\n`

    const columns = messages
      .filter((message) => {
        return message.line === lineNumber && typeof message.column === 'number'
      })
      .map((message) => message.column! - 2)

    if (columns.length) {
      const markers = Array(text.length).fill(' ')
      for (const column of columns) {
        if (column >= 0 && column < markers.length) {
          markers[column] = '^'
        }
      }
      out += ' '.repeat(maxDigits) + ' | ' + markers.join('') + '\n'
    }
  }

  return out
}
