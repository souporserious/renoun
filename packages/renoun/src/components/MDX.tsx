import * as React from 'react'
import type { MDXComponents, PluggableList } from '@renoun/mdx'
import { getMDXRuntimeValue } from '@renoun/mdx/utils'

import { useMDXComponents } from '../mdx/components.js'

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
  remarkPlugins?: PluggableList

  /** Rehype plugins to use. See [PluggableList](https://github.com/unifiedjs/unified?tab=readme-ov-file#pluggablelist) for more info. */
  rehypePlugins?: PluggableList

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
  remarkPlugins,
  rehypePlugins,
  baseUrl,
}: MDXProps) {
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
