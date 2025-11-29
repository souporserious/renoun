import type { Processor } from 'unified'
import type { Element, Root, Parent } from 'hast'
import type { MdxJsxFlowElement } from 'mdast-util-mdx'
import { visitParents, SKIP } from 'unist-util-visit-parents'
import { valueToEstree } from 'estree-util-value-to-estree'

declare module 'unified' {
  interface Data {
    isMarkdown?: boolean
  }
}

interface CodeMetaElement extends Element {
  data?: {
    meta?: string
  }
}

/**
 * Parses the meta string from code fences as props and replaces the parent
 * `pre` element with a `CodeBlock` element.
 *
 * - For **MDX** documents, this injects an `mdxJsxFlowElement` so boolean and
 *   number props are preserved via `mdxJsxAttributeValueExpression`.
 * - For **markdown** documents, this replaces the `pre` element with a standard
 *   HAST `element` node whose `tagName` is `CodeBlock` and whose `properties` map
 *   directly to React props. This allows markdown code fences to be rendered
 *   with the same `CodeBlock` component as MDX.
 */
export default function addCodeBlock(this: Processor) {
  const isMarkdown = this.data('isMarkdown') === true

  return (tree: Root) => {
    visitParents(tree, 'element', (element: Element, ancestors: Parent[]) => {
      if (element.tagName !== 'pre') {
        return
      }

      const code = element.children[0] as CodeMetaElement
      const meta = code.data?.meta
      const properties: Record<string, string | boolean | number> = {
        // By default, we don't format the code block since the majority of
        // the time, the code block is already formatted by the project.
        shouldFormat: false,
      }
      const className = code.properties?.className
      const classList = Array.isArray(className)
        ? className.map(String)
        : typeof className === 'string'
          ? className.split(/\s+/)
          : []
      let languageClassName: string | undefined
      for (let index = 0; index < classList.length; index++) {
        const value = classList[index]
        if (value.startsWith('language-')) {
          languageClassName = value
          break
        }
      }

      if (languageClassName) {
        const raw = languageClassName.slice('language-'.length)
        const dotIndex = raw.lastIndexOf('.')

        if (dotIndex !== -1) {
          // we have “getting-started.mdx” so we treat the whole thing as a path
          properties.path = raw
          properties.language = raw.slice(dotIndex + 1)
        } else {
          // plain “tsx”, “js”, etc.
          properties.language = raw
        }
      }

      if (meta) {
        const parts = meta.split(/\s+/)
        for (let index = 0; index < parts.length; index++) {
          const property = parts[index]
          const equalsIndex = property.indexOf('=')

          // bare flag -> boolean true
          if (equalsIndex === -1) {
            properties[property] = true
            continue
          }

          const key = property.slice(0, equalsIndex)
          const raw = property.slice(equalsIndex + 1)

          // quoted string -> string
          if (/^(['"])(.*)\1$/.test(raw)) {
            properties[key] = raw.slice(1, -1)
            continue
          }

          // coerce braced values to string, boolean, or number
          const match = raw.match(/^\{(.+)\}$/)

          if (match) {
            let value = match[1]

            if (/^(['"])(.*)\1$/.test(value)) {
              properties[key] = value.slice(1, -1)
            } else if (value === 'true' || value === 'false') {
              properties[key] = value === 'true'
            } else {
              const number = Number(value)
              if (Number.isNaN(number)) {
                properties[key] = value
              } else {
                properties[key] = number
              }
            }
            continue
          }

          throw new Error(
            `Invalid meta prop “${property}”: values must be either a bare flag (foo), a quoted string ("…"/'…'), or braced ({…}).`
          )
        }
      }

      // When compiling markdown (via `getMarkdownContent`), we want a HAST
      // element so `hast-util-to-jsx-runtime` can turn it into JSX using the
      // provided `components` map (e.g. `{ CodeBlock }`).
      //
      // When compiling MDX, we emit an `mdxJsxFlowElement` so that the MDX
      // compiler preserves the prop types correctly.
      const codeBlockNode: Element | MdxJsxFlowElement = isMarkdown
        ? {
            type: 'element',
            tagName: 'CodeBlock',
            properties,
            children: code.children,
          }
        : (() => {
            const attributes: MdxJsxFlowElement['attributes'] = []
            for (const key in properties) {
              const value = properties[key]
              if (typeof value === 'boolean' || typeof value === 'number') {
                attributes.push({
                  type: 'mdxJsxAttribute',
                  name: key,
                  value: {
                    type: 'mdxJsxAttributeValueExpression',
                    value: String(value),
                    data: {
                      estree: {
                        type: 'Program',
                        sourceType: 'module',
                        body: [
                          {
                            type: 'ExpressionStatement',
                            expression: valueToEstree(value),
                          },
                        ],
                      },
                    },
                  },
                })
              } else {
                attributes.push({
                  type: 'mdxJsxAttribute',
                  name: key,
                  value,
                })
              }
            }

            return {
              type: 'mdxJsxFlowElement',
              name: 'CodeBlock',
              attributes,
              children: code.children,
            } as MdxJsxFlowElement
          })()

      const parent = ancestors[ancestors.length - 1]
      const index = parent.children.indexOf(element)
      if (index === -1) {
        return
      }
      parent.children.splice(index, 1, codeBlockNode as any)

      return SKIP
    })
  }
}
