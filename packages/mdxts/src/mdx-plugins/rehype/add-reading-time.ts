import type { Parent } from 'unist'
import type { VFile } from 'vfile'

export function addReadingTime() {
  return async (tree: Parent, file: VFile) => {
    const { valueToEstree } = await import('estree-util-value-to-estree')

    tree.children.unshift({
      type: 'mdxjsEsm',
      data: {
        estree: {
          type: 'Program',
          body: [
            {
              type: 'ExportNamedDeclaration',
              declaration: {
                type: 'VariableDeclaration',
                declarations: [
                  {
                    type: 'VariableDeclarator',
                    id: {
                      type: 'Identifier',
                      name: 'readingTime',
                    },
                    init: valueToEstree(file.data.meta!.readingTime!),
                  },
                ],
                kind: 'const',
              },
              specifiers: [],
              source: null,
            },
          ],
          sourceType: 'module',
          comments: [],
        },
      },
    })
  }
}
