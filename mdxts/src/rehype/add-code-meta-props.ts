import type { Element, Node } from 'hast'
import type { VFile } from 'vfile'
import path from 'node:path'
import { getMetadataFromClassName } from '../utils'

export type AddCodeMetaPropsOptions = {
  /** Called when a code block is found. */
  onJavaScriptCodeBlock?: (
    filePath: string,
    lineStart: number | undefined,
    filename: string,
    codeString: string
  ) => void
}

/** Adds code meta props to the code element. */
export function addCodeMetaProps({
  onJavaScriptCodeBlock,
}: AddCodeMetaPropsOptions = {}) {
  return async (tree: Node, file: VFile) => {
    const { visit } = await import('unist-util-visit')
    const { toString } = await import('hast-util-to-string')
    let filename = file.path ? path.parse(file.path).name : ''
    let codeIndex = 0

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

        if (process.env.NODE_ENV === 'development') {
          props.workingDirectory = file.dirname
          props.sourcePath = file.path
          props.line = element.position.start.line
        }

        // Add props to code element
        Object.assign(element.properties, props)

        if (
          codeNode &&
          codeNode.type === 'element' &&
          codeNode.tagName === 'code'
        ) {
          const codeString = toString(codeNode)
          element.properties.code = codeString

          if (codeNode.properties.className) {
            const metadata = getMetadataFromClassName(
              codeNode.properties.className as string[]
            )
            const isJavaScriptLanguage = ['js', 'jsx', 'ts', 'tsx'].some(
              (extension) => extension === metadata.language
            )
            if (isJavaScriptLanguage) {
              onJavaScriptCodeBlock?.(
                file.path,
                codeNode.position?.start.line,
                props.filename ||
                  metadata.filename ||
                  `${filename}.${codeIndex++}.tsx`,
                codeString
              )
            }
          }
        }
      }
    })
  }
}
