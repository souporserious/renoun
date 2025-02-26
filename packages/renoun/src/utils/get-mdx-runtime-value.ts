import * as jsxRuntime from 'react/jsx-runtime'
import * as jsxDevRuntime from 'react/jsx-dev-runtime'
import type { CompileOptions } from '@mdx-js/mdx'
import type { MDXContent } from '@renoun/mdx'

/** Compiles and executes a string of MDX content. */
export async function getMDXRuntimeValue({
  value,
  dependencies,
  remarkPlugins,
  rehypePlugins,
  baseUrl,
}: {
  /** The MDX content to render. */
  value: string

  /** An object of external dependencies that will be available to the MDX source code. */
  dependencies?: Record<string, any>

  /** Remark plugins to use. See [PluggableList](https://github.com/unifiedjs/unified?tab=readme-ov-file#pluggablelist) for more info. */
  remarkPlugins?: CompileOptions['remarkPlugins']

  /** Rehype plugins to use. See [PluggableList](https://github.com/unifiedjs/unified?tab=readme-ov-file#pluggablelist) for more info. */
  rehypePlugins?: CompileOptions['rehypePlugins']

  /** Base URL to resolve imports and named exports from (e.g. `import.meta.url`) */
  baseUrl?: string
}): Promise<{
  default: MDXContent
  [key: string]: any
}> {
  const { compile, run } = await import('@mdx-js/mdx')
  const code = await compile(value, {
    baseUrl,
    rehypePlugins,
    remarkPlugins,
    outputFormat: 'function-body',
    development: process.env.NODE_ENV === 'development',
  })

  return run(code.value, {
    ...(process.env.NODE_ENV === 'development' ? jsxDevRuntime : jsxRuntime),
    ...dependencies,
  } as any)
}
