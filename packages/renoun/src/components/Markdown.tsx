import type { PluggableList } from 'unified'
import { unified } from 'unified'
import { visit } from 'unist-util-visit'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { urlAttributes } from 'html-url-attributes'
import type { Root, Properties } from 'hast'
import { toJsxRuntime } from 'hast-util-to-jsx-runtime'
import type { ComponentType, JSX } from 'react'
import { jsx, jsxs, Fragment } from 'react/jsx-runtime'

declare module 'unified' {
  interface Data {
    isMarkdown?: boolean
  }
}

export type MarkdownComponents = {
  [Key in keyof React.JSX.IntrinsicElements]?:
    | ComponentType<JSX.IntrinsicElements[Key]>
    | keyof JSX.IntrinsicElements
}

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
  const processor = unified()
    .data('isMarkdown', true)
    .use(remarkParse)
    .use(remarkPlugins)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeSafe)
    .use(rehypePlugins)
  const hast = await processor.run(processor.parse(children))

  return toJsxRuntime(hast, {
    Fragment,
    jsx,
    jsxs,
    components,
  })
}

interface RehypeSafeOptions {
  urlTransform?: (context: {
    /** The sanitized URL string. */
    url: string

    /** The attribute name. */
    name: keyof Properties

    /** The stringified attribute value. */
    value: string
  }) => string
}

const safeProtocol = /^(https?|ircs?|mailto|xmpp)$/i

/** Rehype plugin to sanitize URLs in HTML attributes and stringify raw HTML. */
function rehypeSafe({ urlTransform }: RehypeSafeOptions = {}) {
  return (tree: Root) => {
    visit(tree, (node, index, parent) => {
      if (node.type === 'element') {
        for (const name in urlAttributes) {
          if (
            Object.prototype.hasOwnProperty.call(urlAttributes, name) &&
            node.properties &&
            Object.prototype.hasOwnProperty.call(node.properties, name)
          ) {
            const tags = (urlAttributes as any)[name] as string[] | null
            if (tags === null || tags.includes(node.tagName)) {
              const value = String(node.properties[name] ?? '')
              const schemeMatch = value.match(/^([^:/?#]+):/)
              let url = schemeMatch
                ? safeProtocol.test(schemeMatch[1])
                  ? value
                  : ''
                : value

              if (urlTransform) {
                url = urlTransform({ url, name, value })
              }

              node.properties[name] = url
            }
          }
        }
      }

      if (node.type === 'raw' && parent && typeof index === 'number') {
        parent.children[index] = {
          type: 'text',
          value: node.value,
        }
        return index
      }
    })
  }
}
