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

/** Parses the meta string from code fences as props and adds them to the parent `pre` element. */
export default function addPreMetaProps() {
  return (tree: Root) => {
    visit(tree, 'element', (element: CodeMetaElement) => {
      if (element.tagName === 'pre') {
        const codeElement = element.children[0] as CodeMetaElement

        // Map meta string to props
        const meta = codeElement.data?.meta
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

        // Add props to pre element
        Object.assign(element.properties, props)

        return SKIP
      }
    })
  }
}
