import * as React from 'react'
import type { CompileOptions } from '@mdx-js/mdx'
import type { MDXComponents } from '@renoun/mdx'

import { getMDXRuntimeValue } from '../utils/get-mdx-runtime-value.js'

/** Compiles and renders a string of MDX content. */
export async function MDXRenderer({
  children,
  components,
  dependencies,
  remarkPlugins,
  rehypePlugins,
  baseUrl,
}: {
  /** The MDX content to render. */
  children: string

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
  const { default: Content } = await getMDXRuntimeValue({
    value: children,
    dependencies,
    remarkPlugins,
    rehypePlugins,
    baseUrl,
  })

  return <Content components={components} />
}
