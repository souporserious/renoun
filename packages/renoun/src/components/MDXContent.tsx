import * as React from 'react'
import * as jsxRuntime from 'react/jsx-runtime'
import * as jsxDevRuntime from 'react/jsx-dev-runtime'
import type { CompileOptions } from '@mdx-js/mdx'
import 'server-only'

import type { MDXComponents } from './MDXComponents.js'

/** Compiles and renders a string of MDX content. */
export async function MDXContent({
  value,
  components,
  dependencies,
  remarkPlugins,
  rehypePlugins,
  baseUrl,
}: {
  /** The MDX content to render. */
  value: string

  /** Additional components to use or a function that creates them. */
  components?: MDXComponents

  /** An object of external dependencies that will be available to the MDX source code. */
  dependencies?: Record<string, any>

  /** Remark plugins to use. See [PluggableList](https://github.com/unifiedjs/unified?tab=readme-ov-file#pluggablelist) for more info. */
  remarkPlugins?: CompileOptions['remarkPlugins']

  /** Rehype plugins to use. See [PluggableList](https://github.com/unifiedjs/unified?tab=readme-ov-file#pluggablelist) for more info. */
  rehypePlugins?: CompileOptions['rehypePlugins']

  /** Base URL to resolve imports and named exports from (e.g. `import.meta.url`) */
  baseUrl?: string
}) {
  const { compile, run } = await import('@mdx-js/mdx')
  const code = await compile(value, {
    baseUrl,
    rehypePlugins,
    remarkPlugins,
    outputFormat: 'function-body',
    development: process.env.NODE_ENV === 'development',
  })

  const { default: Content } = await run(code.value, {
    ...(process.env.NODE_ENV === 'development' ? jsxDevRuntime : jsxRuntime),
    ...dependencies,
  } as any)

  return <Content components={components as any} />
}
