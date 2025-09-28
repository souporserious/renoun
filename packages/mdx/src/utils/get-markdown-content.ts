import { unified } from 'unified'
import type { PluggableList } from 'unified'
import { visit } from 'unist-util-visit'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import {
  toJsxRuntime,
  type Options as ToJsxRuntimeOptions,
} from 'hast-util-to-jsx-runtime'
import type { Properties, Root } from 'hast'

import { urlAttributes } from './url-attributes.js'

declare module 'unified' {
  interface Data {
    isMarkdown?: boolean
  }
}

export type MarkdownComponents = NonNullable<ToJsxRuntimeOptions['components']>

export interface MarkdownContentOptions {
  /** The markdown source string to compile. */
  source: string

  /** Components to override when rendering the compiled markdown. */
  components?: MarkdownComponents

  /** Remark plugins to run during compilation. */
  remarkPlugins?: PluggableList

  /** Rehype plugins to run during compilation. */
  rehypePlugins?: PluggableList

  /** Runtime configuration passed through to `toJsxRuntime`. */
  runtime: ToJsxRuntimeOptions
}

/** Compile markdown into JSX using the provided runtime configuration. */
export async function getMarkdownContent({
  source,
  components,
  remarkPlugins = [],
  rehypePlugins = [],
  runtime,
}: MarkdownContentOptions) {
  const processor = unified()
    .data('isMarkdown', true)
    .use(remarkParse)
    .use(remarkPlugins)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeSafe)
    .use(rehypePlugins)

  const hast = await processor.run(processor.parse(source))
  const runtimeOptions =
    components === undefined ? runtime : { ...runtime, components }

  return toJsxRuntime(hast, runtimeOptions)
}

interface RehypeSafeOptions {
  urlTransform?: (context: {
    url: string
    name: keyof Properties
    value: string
  }) => string
}

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
            const tags = urlAttributes[name as keyof typeof urlAttributes]
            if (tags === null || tags.includes(node.tagName)) {
              const value = String(node.properties[name] ?? '')
              const schemeMatch = value.match(/^([^:/?#]+):/)
              let url = schemeMatch
                ? safeProtocol.test(schemeMatch[1])
                  ? value
                  : ''
                : value

              if (urlTransform) {
                url = urlTransform({
                  url,
                  name: name as keyof Properties,
                  value,
                })
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

      return undefined
    })
  }
}

const safeProtocol = /^(https?|ircs?|mailto|xmpp)$/i
