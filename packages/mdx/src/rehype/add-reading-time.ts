import type { Parent } from 'unist'
import type { VFile } from 'vfile'
import { valueToEstree } from 'estree-util-value-to-estree'

/** Exports the reading time as a variable. */
export function addReadingTime() {
  return (tree: Parent, file: VFile) => {
    const readingTime = file.data.meta?.readingTime

    if (!readingTime) {
      return
    }

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
                    init: valueToEstree(readingTime),
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
