import {
  getMarkdownContent,
  type MarkdownComponents,
  type PluggableList,
} from '@renoun/mdx'
import { jsx, jsxs, Fragment } from 'react/jsx-runtime'

export type { MarkdownComponents }

export interface MarkdownProps {
  /** The markdown content to render. */
  children: string

  /** Components to override the HTML compiled from markdown syntax. */
  components?: MarkdownComponents

  /** Remark plugins to use. See [PluggableList](https://github.com/unifiedjs/unified?tab=readme-ov-file#pluggablelist) for more info. */
  remarkPlugins?: PluggableList

  /** Rehype plugins to use. See [PluggableList](https://github.com/unifiedjs/unified?tab=readme-ov-file#pluggablelist) for more info. */
  rehypePlugins?: PluggableList
}

/** Compiles and renders a string of markdown content. */
export async function Markdown({
  children,
  components,
  remarkPlugins = [],
  rehypePlugins = [],
}: MarkdownProps) {
  return getMarkdownContent({
    source: children,
    components,
    remarkPlugins,
    rehypePlugins,
    runtime: {
      Fragment,
      jsx,
      jsxs,
    },
  })
}
