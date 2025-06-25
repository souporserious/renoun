import type { Processor } from 'unified'
import type { Element, Root, Parent } from 'hast'
import type { MdxJsxFlowElement } from 'mdast-util-mdx'
import { visitParents, SKIP } from 'unist-util-visit-parents'

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
 * `pre` element with a `CodeBlock`  element.
 */
export default function addCodeBlock(this: Processor) {
  const isMarkdown = this.data('isMarkdown') === true

  return (tree: Root) => {
    if (isMarkdown) {
      return
    }

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
      const languageClassName = classList.find((className) =>
        className.startsWith('language-')
      )

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

      meta?.split(/\s+/).forEach((property) => {
        const equalsIndex = property.indexOf('=')

        // bare flag -> boolean true
        if (equalsIndex === -1) {
          properties[property] = true
          return
        }

        const key = property.slice(0, equalsIndex)
        const raw = property.slice(equalsIndex + 1)

        // quoted string -> string
        if (/^(['"])(.*)\1$/.test(raw)) {
          properties[key] = raw.slice(1, -1)
          return
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
          return
        }

        throw new Error(
          `Invalid meta prop “${property}”: values must be either a bare flag (foo), a quoted string ("…"/'…'), or braced ({…}).`
        )
      })

      const codeBlockNode: MdxJsxFlowElement = {
        type: 'mdxJsxFlowElement',
        name: 'CodeBlock',
        attributes: Object.entries(properties).map(([key, value]) => ({
          type: 'mdxJsxAttribute',
          name: key,
          value: String(value),
        })),
        children: code.children as any,
      }
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
