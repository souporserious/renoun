import type { Element, Node } from 'hast'

/** Adds code meta props to the code element. */
export function addCodeMetaProps() {
  return async (tree: Node) => {
    const { visit } = await import('unist-util-visit')
    const { toString } = await import('hast-util-to-string')

    visit(tree, 'element', (element: Element) => {
      if (element.tagName === 'pre') {
        const codeNode = element.children[0]

        // Map meta string to props
        const meta = (codeNode.data as any)?.meta as string | undefined
        const props: Record<string, any> = {}
        meta?.split(' ').forEach((prop) => {
          const [key, value] = prop.split('=')
          props[key] =
            typeof value === 'undefined'
              ? true
              : value.replace(/^["']|["']$/g, '')
        })

        // Add props to code element
        Object.assign(element.properties, props)

        if (
          codeNode &&
          codeNode.type === 'element' &&
          codeNode.tagName === 'code'
        ) {
          const codeString = toString(codeNode)
          element.properties.code = codeString
        }
      }
    })
  }
}
