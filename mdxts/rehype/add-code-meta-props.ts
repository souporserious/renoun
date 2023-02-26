import type { Element } from 'hast'
import { transformCodeSync } from '../transform'
import { getLanguage } from './utils'

/** Pass through meta string and code as props to `code` elements. */
export async function addCodeMetaProps(tree: Element) {
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
        const codeString = toString(element)
        const classNames = (codeNode.properties?.className || []) as string[]
        const language = getLanguage(classNames)

        element.properties.code = codeString

        if (/tsx?|jsx?/.test(language)) {
          try {
            element.properties.transformedCode = transformCodeSync(codeString)
          } catch (error) {
            throw new Error(
              `Error transforming code block for meta string MDX transform`,
              { cause: error }
            )
          }
        }

        const meta = element.data?.meta as string | undefined

        /* Map meta string to props. */
        meta?.split(' ').forEach((prop) => {
          const [key, value] = prop.split('=')
          element.properties[key] = value ?? true
        })
      }
    }
  })
}
