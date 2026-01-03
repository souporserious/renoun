import type { Program } from 'estree'
import type { Processor } from 'unified'
import type { Root } from 'mdast'
import type { VFile } from 'vfile'
import { valueToEstree } from 'estree-util-value-to-estree'
import 'mdast-util-mdx'

import { parseFrontmatter } from '../utils/parse-frontmatter.js'

function hasFrontmatterExport(tree: Root): boolean {
  for (const node of tree.children) {
    if (node.type !== 'mdxjsEsm') {
      continue
    }

    const program = node.data?.estree as Program | undefined

    if (!program) {
      continue
    }

    for (const statement of program.body) {
      if (statement.type !== 'ExportNamedDeclaration') {
        continue
      }

      if (statement.declaration?.type === 'VariableDeclaration') {
        for (const declaration of statement.declaration.declarations) {
          if (
            declaration.id.type === 'Identifier' &&
            declaration.id.name === 'frontmatter'
          ) {
            return true
          }
        }
      }

      if (statement.specifiers) {
        for (const specifier of statement.specifiers) {
          if (
            specifier.exported.type === 'Identifier' &&
            specifier.exported.name === 'frontmatter'
          ) {
            return true
          }

          if (
            specifier.exported.type === 'Literal' &&
            String(specifier.exported.value) === 'frontmatter'
          ) {
            return true
          }
        }
      }
    }
  }

  return false
}

export default function addFrontmatter(this: Processor) {
  return function (tree: Root, file: VFile) {
    if (typeof file.value !== 'string') {
      return
    }

    const { content, frontmatter } = parseFrontmatter(file.value)

    if (!frontmatter) {
      return
    }

    if (content !== file.value) {
      file.value = content
    }

    while (tree.children.length && tree.children[0]?.type === 'yaml') {
      tree.children.shift()
    }

    if (hasFrontmatterExport(tree)) {
      file.data ||= {}
      ;(file.data as any).frontmatter = frontmatter
      return
    }

    const program: Program = {
      type: 'Program',
      sourceType: 'module',
      body: [
        {
          type: 'ExportNamedDeclaration',
          declaration: {
            type: 'VariableDeclaration',
            kind: 'const',
            declarations: [
              {
                type: 'VariableDeclarator',
                id: { type: 'Identifier', name: 'frontmatter' },
                init: valueToEstree(frontmatter),
              },
            ],
          },
          specifiers: [],
          attributes: [],
          source: null,
        },
      ],
    }

    const exportNode = {
      type: 'mdxjsEsm',
      value: '',
      data: {
        estree: program,
      },
    }

    tree.children.unshift(exportNode as any)

    file.data ||= {}
    ;(file.data as any).frontmatter = frontmatter
  }
}
