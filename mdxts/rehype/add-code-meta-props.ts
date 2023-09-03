import type { Element, Parent, Node } from 'hast'
import type { VFile } from 'vfile'
import type { Project } from 'ts-morph'

export function addCodeMetaProps(project: Project) {
  return async (tree: Node, file: VFile) => {
    const { visit } = await import('unist-util-visit')
    const { toString } = await import('hast-util-to-string')
    const basePath = file.path ? file.path.replace(/\W+/g, '_') : 'unknown'
    let indexPath = []

    visit(
      tree,
      'element',
      (element: Element, index: number, parent: Parent) => {
        if (parent) {
          indexPath.push(index)
        }

        if (element.tagName === 'pre') {
          const codeNode = element.children[0]

          if (
            codeNode &&
            codeNode.type === 'element' &&
            codeNode.tagName === 'code'
          ) {
            const codeString = toString(codeNode)
            element.properties.code = codeString

            const codeFileName = `code_${basePath}_${indexPath.join('_')}.ts`
            project.createSourceFile(codeFileName, codeString)

            // Map meta string to props
            const meta = (codeNode.data as any)?.meta as string | undefined
            meta?.split(' ').forEach((prop) => {
              const [key, value] = prop.split('=')
              element.properties[key] = value ?? true
            })
          }
        }

        // Reset the index path if we are back to the root node
        if (!parent) {
          indexPath = []
        }
      }
    )
  }
}
