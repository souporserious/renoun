import type { Parent } from 'unist'
import type { Element, Properties } from 'hast'
import { toString } from 'hast-util-to-string'
import { visit, SKIP } from 'unist-util-visit'
import { bundledLanguagesInfo } from 'shiki'

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

const allBundledLanguages = bundledLanguagesInfo
  .map((language) => language.id)
  .concat(['js', 'ts'])

/** Parses `CodeBlock` and `CodeInline` props and adds them to `pre` and `code` element properties respectively. */
export function addCodeMetaProps() {
  return (tree: Parent) => {
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

        return SKIP
      } else if (element.tagName === 'code') {
        const codeString = toString(element)
        const firstSpaceIndex = codeString.indexOf(' ')

        if (firstSpaceIndex > -1) {
          const language = codeString.substring(0, firstSpaceIndex)
          const isValidLanguage = allBundledLanguages.includes(language)

          if (isValidLanguage) {
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

const languageKey = 'language-'
const languageLength = languageKey.length

/** Parses file metadata from a remark code block class name. */
function getClassNameMetadata(className: string | string[]) {
  const classNames = Array.isArray(className) ? className : className.split(' ')
  const filenameOrLanguage = classNames
    .find((name) => name.startsWith(languageKey))
    ?.slice(languageLength)

  if (!filenameOrLanguage) {
    return null
  }

  const extension = filenameOrLanguage.split('.').pop() ?? filenameOrLanguage

  return {
    filename: filenameOrLanguage?.includes('.') ? filenameOrLanguage : null,
    language: extension,
  } as {
    filename: string | null
    language: string
  }
}
