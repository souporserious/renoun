import type { Root } from 'hast'
import type { Element, Properties } from 'hast'
import { visit, SKIP } from 'unist-util-visit'

interface CodeMetaElement extends Element {
  data?: {
    meta?: string
  }
  properties: Properties & {
    className?: string | string[]
    filename?: string
    language?: string
  }
}

/** Parses `CodeBlock` and `CodeInline` props and adds them to `pre` and `code` element properties respectively. */
export function addCodeMetaProps() {
  return async (tree: Root) => {
    visit(tree, 'element', (element: CodeMetaElement) => {
      if (element.tagName === 'pre') {
        const codeNode = element.children[0] as CodeMetaElement

        // Map meta string to props
        const meta = codeNode.data?.meta
        const props: Record<string, any> = {}

        meta?.split(' ').forEach((prop) => {
          const indexOfFirstEquals = prop.indexOf('=')
          if (indexOfFirstEquals === -1) {
            // Coerce boolean props to true if they don't have an explicit value
            props[prop] = true
          } else {
            const key = prop.substring(0, indexOfFirstEquals)
            const value = prop.substring(indexOfFirstEquals + 1)
            // Strip surrounding quotes if present
            props[key] = value.replace(/^["']|["']$/g, '')
          }
        })

        // Add props to code element
        Object.assign(element.properties, props)

        return SKIP
      }
    })
  }
}
