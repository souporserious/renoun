import type { JsxOpeningElement, JsxSelfClosingElement } from 'ts-morph'
import { Project, Node } from 'ts-morph'

import { getSourcePath } from '../utils/get-source-path'

/** Adds code meta props to MDXTS components. */
export function addCodeMetaProps(
  sourceCode: string,
  resourcePath: string,
  workingDirectory: string,
  gitSource?: string,
  gitBranch?: string,
  gitProvider?: string
): string {
  const project = new Project({ useInMemoryFileSystem: true })
  const sourceFile = project.createSourceFile('index.tsx', sourceCode)
  const jsxElements = sourceFile.getDescendants().filter((node) => {
    return Node.isJsxOpeningElement(node) || Node.isJsxSelfClosingElement(node)
  }) as (JsxOpeningElement | JsxSelfClosingElement)[]

  jsxElements.forEach((element) => {
    const tagName = element.getTagNameNode().getText()
    const attributesToAdd = []

    if (tagName === 'CodeBlock' || tagName === 'ExportedTypes') {
      const workingDirectoryAttribute = element.getAttribute('workingDirectory')
      if (!workingDirectoryAttribute) {
        attributesToAdd.push({
          name: 'workingDirectory',
          initializer: `"${workingDirectory}"`,
        })
      }
    }

    if (tagName === 'CodeBlock') {
      const sourcePathAttribute = element.getAttribute('sourcePath')
      if (!sourcePathAttribute) {
        const { line, column } = sourceFile.getLineAndColumnAtPos(
          element.getStart()
        )
        const sourcePath = getSourcePath(
          resourcePath,
          line,
          column,
          gitSource,
          gitBranch,
          gitProvider
        )
        attributesToAdd.push({
          name: 'sourcePath',
          initializer: `"${sourcePath}"`,
        })
      }
    }

    if (attributesToAdd.length > 0) {
      element.insertAttributes(0, attributesToAdd)
    }
  })

  return sourceFile.getFullText()
}
