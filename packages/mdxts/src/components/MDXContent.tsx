import * as React from 'react'
import * as jsxRuntime from 'react/jsx-runtime'
import * as jsxDevRuntime from 'react/jsx-dev-runtime'
import { compile, run } from '@mdx-js/mdx'
import type { PluggableList } from '@mdx-js/mdx/lib/core'
import 'server-only'

import type { MDXComponents } from './MDXComponents'

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
  remarkPlugins?: PluggableList

  /** Rehype plugins to use. See [PluggableList](https://github.com/unifiedjs/unified?tab=readme-ov-file#pluggablelist) for more info. */
  rehypePlugins?: PluggableList

  /** Base URL to resolve imports and named exports from (e.g. `import.meta.url`) */
  baseUrl?: string
}) {
  const code = await compile(value, {
    baseUrl,
    rehypePlugins,
    remarkPlugins,
    useDynamicImport: true,
    outputFormat: 'function-body',
  })
  const { default: Content } = await run(code.value, {
    ...(process.env.NODE_ENV === 'development' ? jsxDevRuntime : jsxRuntime),
    ...dependencies,
  })

  return <Content components={components} />
}
