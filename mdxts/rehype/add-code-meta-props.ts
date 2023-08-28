import type { Element } from 'hast'
import type { VFile } from 'vfile'

/** Pass through meta string and code as props to `code` elements. */
export async function addCodeMetaProps(tree: Element, file: VFile) {
  const { visit } = await import('unist-util-visit')
  const { toString } = await import('hast-util-to-string')

  visit(tree, 'element', (element) => {
    if (element.tagName === 'pre') {
      const codeNode = element.children[0]

      if (
        codeNode &&
        codeNode.type === 'element' &&
        codeNode.tagName === 'code'
      ) {
        element.properties.code = toString(element)

        const meta = codeNode.data?.meta as string | undefined

        /* Map meta string to props. */
        meta?.split(' ').forEach((prop) => {
          const [key, value] = prop.split('=')
          element.properties[key] = value ?? true
        })
      }
    }
  })
}
