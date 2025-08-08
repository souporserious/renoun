import type { Processor } from 'unified'
import type { Root, Heading } from 'mdast'
import type { VFile } from 'vfile'
import { define } from 'unist-util-mdx-define'
import { visit } from 'unist-util-visit'
import { toString } from 'mdast-util-to-string'
import 'mdast-util-mdx'

declare module 'unified' {
  interface Data {
    isMarkdown?: boolean
  }
}

declare module 'mdast' {
  interface Data {
    hProperties?: Record<string, any>
  }
}

export interface AddHeadingsOptions {
  /** Whether to allow the `getHeadings` export. */
  allowGetHeadings?: boolean
}

export type MDXHeadings = {
  /** The slugified heading text. */
  id: string

  /** The heading level. */
  level: number

  /** The stringified heading text. */
  text: string

  /** The heading JSX children. */
  children?: React.ReactNode
}[]

export default function addHeadings(
  this: Processor,
  opts: AddHeadingsOptions = {}
) {
  const isMarkdown = this.data('isMarkdown') === true
  const { allowGetHeadings = false } = opts

  return function (tree: Root, file: VFile) {
    const headingsArray: any[] = []
    const headingCounts = new Map<string, number>()
    let hasGetHeadingsExport = false
    let hasHeadingsExport = false

    visit(tree, 'heading', (node: Heading) => {
      const text = toString(node)
      let slug = createSlug(text)

      if (headingCounts.has(slug)) {
        const count = headingCounts.get(slug)! + 1
        headingCounts.set(slug, count)
        slug = `${slug}-${count}`
      } else {
        headingCounts.set(slug, 1)
      }

      headingsArray.push({
        type: 'ObjectExpression',
        properties: [
          {
            type: 'Property',
            key: { type: 'Identifier', name: 'id' },
            value: { type: 'Literal', value: slug },
            kind: 'init',
          },
          {
            type: 'Property',
            key: { type: 'Identifier', name: 'level' },
            value: { type: 'Literal', value: node.depth },
            kind: 'init',
          },
          {
            type: 'Property',
            key: { type: 'Identifier', name: 'children' },
            value: mdastNodesToJsxFragment(node.children),
            kind: 'init',
          },
          {
            type: 'Property',
            key: { type: 'Identifier', name: 'text' },
            value: { type: 'Literal', value: text },
            kind: 'init',
          },
        ],
      })

      node.data ??= {}
      node.data.hProperties ??= {}
      node.data.hProperties.id = slug
    })

    visit(tree, (node) => {
      if ((node as any).type !== 'mdxjsEsm') {
        return
      }

      const program = (node as any)?.data?.estree

      if (!program || !Array.isArray(program.body)) {
        return
      }

      for (const statement of program.body) {
        if (statement.type !== 'ExportNamedDeclaration') continue
        if (statement.declaration) {
          const declaration = statement.declaration
          if (
            declaration.type === 'FunctionDeclaration' &&
            declaration.id?.name === 'getHeadings'
          ) {
            hasGetHeadingsExport = true
            break
          }
          if (declaration.type === 'VariableDeclaration') {
            for (const declarator of declaration.declarations) {
              if (
                declarator.id?.type === 'Identifier' &&
                declarator.id.name === 'getHeadings'
              ) {
                hasGetHeadingsExport = true
                break
              }
              if (
                declarator.id?.type === 'Identifier' &&
                declarator.id.name === 'headings'
              ) {
                hasHeadingsExport = true
                break
              }
            }
          }
        }
        if (Array.isArray(statement.specifiers)) {
          for (const specifier of statement.specifiers) {
            if (specifier.exported?.name === 'getHeadings') {
              hasGetHeadingsExport = true
              break
            }
            if (specifier.exported?.name === 'headings') {
              hasHeadingsExport = true
              break
            }
          }
        }
      }
    })

    if (hasHeadingsExport) {
      const message = file.message(
        '[renoun/mdx] Exporting "headings" directly is not supported. Use `export function getHeadings(headings) { ... }`.',
        undefined,
        'renoun-mdx:headings-export'
      )
      message.fatal = true
      return
    }

    if (!allowGetHeadings && hasGetHeadingsExport) {
      const message = file.message(
        '[renoun/mdx] The `getHeadings` export is disabled in this environment.',
        undefined,
        'renoun-mdx:get-headings-disabled'
      )
      message.fatal = true
      return
    }

    if (!isMarkdown) {
      const generatedHeadingsArrayExpression: any = {
        type: 'ArrayExpression',
        elements: headingsArray,
      }

      const headingsExpression = hasGetHeadingsExport
        ? {
            // (() => { const validatedHeadingsValue = getHeadings([...]);
            //   if (!Array.isArray(validatedHeadingsValue)) {
            //     throw new Error('[renoun/mdx] getHeadings(headings) must return an array')
            //   }
            //   return validatedHeadingsValue
            // })()
            type: 'CallExpression',
            callee: {
              type: 'ArrowFunctionExpression',
              async: false,
              expression: false,
              params: [],
              body: {
                type: 'BlockStatement',
                body: [
                  {
                    type: 'VariableDeclaration',
                    kind: 'const',
                    declarations: [
                      {
                        type: 'VariableDeclarator',
                        id: {
                          type: 'Identifier',
                          name: 'validatedHeadingsValue',
                        },
                        init: {
                          type: 'CallExpression',
                          callee: { type: 'Identifier', name: 'getHeadings' },
                          optional: false,
                          arguments: [generatedHeadingsArrayExpression],
                        },
                      },
                    ],
                  },
                  {
                    type: 'IfStatement',
                    test: {
                      type: 'UnaryExpression',
                      operator: '!',
                      prefix: true,
                      argument: {
                        type: 'CallExpression',
                        callee: {
                          type: 'MemberExpression',
                          object: { type: 'Identifier', name: 'Array' },
                          property: { type: 'Identifier', name: 'isArray' },
                          computed: false,
                          optional: false,
                        },
                        arguments: [
                          {
                            type: 'Identifier',
                            name: 'validatedHeadingsValue',
                          },
                        ],
                      },
                    },
                    consequent: {
                      type: 'BlockStatement',
                      body: [
                        {
                          type: 'ThrowStatement',
                          argument: {
                            type: 'NewExpression',
                            callee: { type: 'Identifier', name: 'Error' },
                            arguments: [
                              {
                                type: 'Literal',
                                value:
                                  '[renoun/mdx] getHeadings(headings) must return an array',
                              },
                            ],
                          },
                        },
                      ],
                    },
                  },
                  {
                    type: 'ReturnStatement',
                    argument: {
                      type: 'Identifier',
                      name: 'validatedHeadingsValue',
                    },
                  },
                ],
              },
            },
            arguments: [],
          }
        : generatedHeadingsArrayExpression

      define(tree, file, { headings: headingsExpression as any })
    }
  }
}

/** Convert an array of mdast nodes into a text node or JSX fragment. */
function mdastNodesToJsxFragment(nodes: any[]) {
  const jsxChildren = nodes.map((node) => mdastNodeToJsxChild(node))

  if (jsxChildren.length === 1) {
    const child = jsxChildren[0]

    if (child.type === 'JSXText') {
      return {
        type: 'Literal',
        value: child.value,
      }
    }

    return child
  }

  return {
    type: 'JSXFragment',
    openingFragment: {
      type: 'JSXOpeningFragment',
      attributes: [],
      selfClosing: false,
    },
    closingFragment: { type: 'JSXClosingFragment' },
    children: jsxChildren,
  }
}

/**
 * Convert an mdast inline node into its corresponding ESTree JSX AST node.
 * This function covers:
 *
 * - text
 * - strong, emphasis, delete, inlineCode
 * - break (line break)
 * - link, image
 */
function mdastNodeToJsxChild(node: any) {
  switch (node.type) {
    case 'text':
      return { type: 'JSXText', value: node.value }
    case 'strong':
      return makeJsxElement('strong', node.children)
    case 'emphasis':
      return makeJsxElement('em', node.children)
    case 'inlineCode':
      return makeJsxElement('code', [{ type: 'JSXText', value: node.value }])
    case 'delete':
      return makeJsxElement('del', node.children)
    case 'break':
      return {
        type: 'JSXElement',
        openingElement: {
          type: 'JSXOpeningElement',
          name: { type: 'JSXIdentifier', name: 'br' },
          attributes: [],
          selfClosing: true,
        },
        closingElement: null,
        children: [],
      }
    case 'image':
      return makeSafeImage(node)
    case 'link':
      return makeSafeLink(node)
    default:
      return { type: 'JSXText', value: toString(node) }
  }
}

/**
 * Check if a URL is safe.
 * It checks if the URL has a valid protocol and is not a data URI.
 */
function isSafeUrl(url: string) {
  try {
    const parsed = new URL(url, 'http://example.com')
    return ['http:', 'https:'].includes(parsed.protocol)
  } catch {
    return false
  }
}

/**
 * Convert an mdast image node into its corresponding ESTree JSX AST node.
 * It builds an element like <img src={url} alt={alt} title={title} />.
 */
function makeSafeImage(node: any) {
  const attributes = []

  if (isSafeUrl(node.url)) {
    attributes.push({
      type: 'JSXAttribute',
      name: { type: 'JSXIdentifier', name: 'src' },
      value: { type: 'Literal', value: node.url },
    })
  }
  if (node.alt)
    attributes.push({
      type: 'JSXAttribute',
      name: { type: 'JSXIdentifier', name: 'alt' },
      value: { type: 'Literal', value: node.alt },
    })
  if (node.title)
    attributes.push({
      type: 'JSXAttribute',
      name: { type: 'JSXIdentifier', name: 'title' },
      value: { type: 'Literal', value: node.title },
    })
  return {
    type: 'JSXElement',
    openingElement: {
      type: 'JSXOpeningElement',
      name: { type: 'JSXIdentifier', name: 'img' },
      attributes,
      selfClosing: true,
    },
    closingElement: null,
    children: [],
  }
}

/**
 * Convert an mdast link node into its corresponding ESTree JSX AST node.
 * It builds an element like <a href={url} title={title}>{children}</a>.
 */
function makeSafeLink(node: any) {
  const attributes = []

  if (isSafeUrl(node.url)) {
    attributes.push({
      type: 'JSXAttribute',
      name: { type: 'JSXIdentifier', name: 'href' },
      value: { type: 'Literal', value: node.url },
    })
  }

  if (node.title) {
    attributes.push({
      type: 'JSXAttribute',
      name: { type: 'JSXIdentifier', name: 'title' },
      value: { type: 'Literal', value: node.title },
    })
  }

  return {
    type: 'JSXElement',
    openingElement: {
      type: 'JSXOpeningElement',
      name: { type: 'JSXIdentifier', name: 'a' },
      attributes,
      selfClosing: false,
    },
    closingElement: {
      type: 'JSXClosingElement',
      name: { type: 'JSXIdentifier', name: 'a' },
    },
    children: node.children.map((child: any) => mdastNodeToJsxChild(child)),
  }
}

/**
 * Helper to create a simple JSXElement.
 * It builds an element like <tagName>{...children}</tagName>.
 */
function makeJsxElement(tagName: string, mdastChildren: any[]): any {
  return {
    type: 'JSXElement',
    openingElement: {
      type: 'JSXOpeningElement',
      name: { type: 'JSXIdentifier', name: tagName },
      attributes: [],
      selfClosing: false,
    },
    closingElement: {
      type: 'JSXClosingElement',
      name: { type: 'JSXIdentifier', name: tagName },
    },
    children: mdastChildren.map((child) => mdastNodeToJsxChild(child)),
  }
}

/** Create a slug from a string. */
function createSlug(input: string) {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // strip zero-width
    .replace(/([a-z\d])([A-Z])/g, '$1-$2') // split camelCase
    .replace(/[\p{Pd}\s_]+/gu, '-') // spaces/any dash → -
    .replace(/[^\p{Letter}\p{Number}-]+/gu, '') // drop other punct/symbols
    .replace(/-+/g, '-') // collapse ---
    .replace(/^-+|-+$/g, '') // trim -
    .toLowerCase()
}
