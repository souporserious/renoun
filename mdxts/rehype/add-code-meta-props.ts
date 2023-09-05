import type { Element, Parent, Node } from 'hast'
import type { VFile } from 'vfile'
import path from 'node:path'
import { getMetadataFromClassName } from '../utils'

export type AddCodeMetaPropsOptions = {
  /** Called when a code block is found. */
  onCodeBlock?: (filename: string, codeString: string) => void
}

/** Adds code meta props to the code element. */
export function addCodeMetaProps({
  onCodeBlock,
}: AddCodeMetaPropsOptions = {}) {
  return async (tree: Node, file: VFile) => {
    const { visit } = await import('unist-util-visit')
    const { toString } = await import('hast-util-to-string')
    let filename = file.path ? path.parse(file.path).name : ''
    let depth = 0

    visit(
      tree,
      'element',
      (element: Element, index: number, parent: Parent) => {
        if (parent) {
          depth++
        }

        if (element.tagName === 'pre') {
          const codeNode = element.children[0]

          if (
            codeNode &&
            codeNode.type === 'element' &&
            codeNode.tagName === 'code'
          ) {
            let codeFilename = `${filename}_${depth}_${index}.tsx`

            if (codeNode.properties.className) {
              const metadata = getMetadataFromClassName(
                codeNode.properties.className as string[]
              )
              if (metadata.filename) {
                codeFilename = metadata.filename
              }
            }

            const codeString = toString(codeNode)
            element.properties.code = codeString

            console.log(codeFilename)
            onCodeBlock?.(codeFilename, codeString)

            // Map meta string to props
            const meta = (codeNode.data as any)?.meta as string | undefined
            meta?.split(' ').forEach((prop) => {
              const [key, value] = prop.split('=')
              element.properties[key] = value ?? true
            })
          }
        }

        // Reset the depth if we are back to the root node
        if (!parent) {
          depth = 0
        }
      }
    )
  }
}
