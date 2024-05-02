import type { Element, Root } from 'hast'

import { getClassNameMetadata } from '../../utils/get-class-name-metadata'

/** Parses `CodeBlock` and `CodeInline` props and adds them to `pre` and `code` element properties respectively. */
export function addCodeMetaProps() {
  return async (tree: Root) => {
    const { visit } = await import('unist-util-visit')
    const { toString } = await import('hast-util-to-string')
    const { bundledLanguages } = await import('shiki/bundle/web')

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
          element.properties.value = codeString

          // get class name from code element
          const className = codeNode.properties.className as string
          const metadata = getClassNameMetadata(className || '')

          // Add filename and language as a props if they don't already exist
          if (metadata) {
            if (!element.properties.filename && metadata.filename) {
              element.properties.filename = metadata.filename
            }

            if (!element.properties.language) {
              element.properties.language = metadata.language
            }
          }
        }
      } else if (element.tagName === 'code') {
        const codeString = toString(element)
        element.properties.value = codeString

        const firstSpaceIndex = codeString.indexOf(' ')

        if (firstSpaceIndex > -1) {
          const language = codeString.substring(0, firstSpaceIndex)

          if (Object.keys(bundledLanguages).includes(language)) {
            // Add the language as a prop for syntax highlighting
            element.properties.language = language

            // Replace the element's content with just the code
            element.children = [
              {
                type: 'text',
                value: codeString.substring(firstSpaceIndex + 1),
              },
            ]
          }
        }
      }
    })
  }
}
