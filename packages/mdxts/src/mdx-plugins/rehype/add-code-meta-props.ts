import type { Element, Root } from 'hast'

const languageMap: Record<string, any> = {
  mjs: 'javascript',
  js: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
}

const ADDITIONAL_LANGUAGES = Object.keys(languageMap)

/** Adds code meta props to the code element. */
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
          element.properties.code = codeString
        }
      } else if (element.tagName === 'code') {
        const codeString = toString(element)
        const firstSpaceIndex = codeString.indexOf(' ')

        if (firstSpaceIndex > -1) {
          const possibleLanguage = codeString.substring(0, firstSpaceIndex)
          const isValidLanguage = Object.keys(bundledLanguages)
            .concat(ADDITIONAL_LANGUAGES)
            .includes(possibleLanguage)

          if (isValidLanguage) {
            const language = languageMap[possibleLanguage] || possibleLanguage

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
