import * as React from 'react'
import type { CompileOptions } from '@mdx-js/mdx'
import type { MDXComponents } from '@renoun/mdx'

import { useMDXComponents } from '../mdx/components.js'
import { getMDXRuntimeValue } from '../utils/get-mdx-runtime-value.js'

export interface MDXProps {
  /** The MDX content to render. */
  children: string

  /**
   * Additional components that will be available to use in the MDX content.
   * The default components from `renoun/mdx/components` are used if not provided.
   */
  components?: MDXComponents

  /** An object of external dependencies that will be available to the MDX source code. */
  dependencies?: Record<string, any>

  /** Remark plugins to use. See [PluggableList](https://github.com/unifiedjs/unified?tab=readme-ov-file#pluggablelist) for more info. */
  remarkPlugins?: CompileOptions['remarkPlugins']

  /** Rehype plugins to use. See [PluggableList](https://github.com/unifiedjs/unified?tab=readme-ov-file#pluggablelist) for more info. */
  rehypePlugins?: CompileOptions['rehypePlugins']

  /** Base URL to resolve imports and named exports from (e.g. `import.meta.url`) */
  baseUrl?: string
}

/**
 * Compiles and renders a string of MDX content. Note, a set of default `remarkPlugins`
 * and `rehypePlugins` options are only used if both are not provided.
 */
export async function MDX({
  children,
  components = useMDXComponents(),
  dependencies,
  remarkPlugins: remarkPluginsProp,
  rehypePlugins: rehypePluginsProp,
  baseUrl,
}: MDXProps) {
  let remarkPlugins: CompileOptions['remarkPlugins'] = remarkPluginsProp
  let rehypePlugins: CompileOptions['rehypePlugins'] = rehypePluginsProp

  if (remarkPlugins === undefined && rehypePlugins === undefined) {
    remarkPlugins = (await import('@renoun/mdx/remark')).remarkPlugins
    rehypePlugins = (await import('@renoun/mdx/rehype')).rehypePlugins
  }

  const { default: Content } = await getMDXRuntimeValue({
    value: children,
    dependencies,
    remarkPlugins,
    rehypePlugins,
    baseUrl,
  })

  return <Content components={components} />
}
