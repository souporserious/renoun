import type { Element } from 'hast'
import type { Project } from 'ts-morph'
import { transformCodeSync } from '../transform'
import { getLanguage } from './utils'

export async function transformExamples(tree: Element, project: Project) {
  const { visit } = await import('unist-util-visit')
  const { toString } = await import('hast-util-to-string')
  await import('mdast-util-mdx-jsx')

  visit(tree, 'mdxJsxFlowElement', (mdxJsxFlowElement) => {
    if (mdxJsxFlowElement.name === 'Example') {
      visit(mdxJsxFlowElement, 'element', (element) => {
        if (element.tagName === 'pre') {
          const codeNode = element.children[0]

          if (
            codeNode &&
            codeNode.type === 'element' &&
            codeNode.tagName === 'code' &&
            codeNode.properties
          ) {
            const code = toString(element)
            const classNames = (codeNode.properties?.className ||
              []) as string[]
            const language = getLanguage(classNames)

            mdxJsxFlowElement.attributes.push(
              {
                type: 'mdxJsxAttribute',
                name: 'code',
                value: code,
              },
              {
                type: 'mdxJsxAttribute',
                name: 'transformedCode',
                value: transformCodeSync(code),
              },
              {
                type: 'mdxJsxAttribute',
                name: 'language',
                value: language,
              }
            )
          }
        }
      })
    }

    if (mdxJsxFlowElement.name === 'Preview') {
      // TODO
    }
  })
}
