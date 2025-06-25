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

/** An array of headings metadata. */
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

/** Exports a `headings` variable containing an array of headings metadata. */
export default function addHeadings(this: Processor) {
  const isMarkdown = this.data('isMarkdown') === true

  return function (tree: Root, file: VFile) {
    const headingsArray: any[] = []
    const headingCounts = new Map<string, number>()

    visit(tree, 'heading', (node: Heading) => {
      const text = toString(node)
      let slug = createSlug(text)

      // Ensure unique slugs.
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

      // Also add an id for HTML output.
      node.data ??= {}
      node.data.hProperties ??= {}
      node.data.hProperties.id = slug
    })

    if (!isMarkdown) {
      define(tree, file, {
        headings: {
          type: 'ArrayExpression',
          elements: headingsArray,
        },
      })
    }
  }
}

/** Convert an array of mdast nodes into a text node or JSX fragment. */
function mdastNodesToJsxFragment(nodes: any[]) {
  const jsxChildren = nodes.map(mdastNodeToJsxChild)

  if (jsxChildren.length === 1) {
    const child = jsxChildren[0]

    if (child.type === 'JSXText') {
      return { type: 'Literal', value: child.value }
    }
  }

  return {
    type: 'JSXFragment',
    openingFragment: {
      type: 'JSXOpeningFragment',
      attributes: [],
      selfClosing: false,
    },
    closingFragment: {
      type: 'JSXClosingFragment',
    },
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

    case 'image': {
      const attributes = [
        {
          type: 'JSXAttribute',
          name: { type: 'JSXIdentifier', name: 'src' },
          value: { type: 'Literal', value: node.url },
        },
      ]
      if (node.alt) {
        attributes.push({
          type: 'JSXAttribute',
          name: { type: 'JSXIdentifier', name: 'alt' },
          value: { type: 'Literal', value: node.alt },
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
          name: { type: 'JSXIdentifier', name: 'img' },
          attributes,
          selfClosing: true,
        },
        closingElement: null,
        children: [],
      }
    }

    default:
      return { type: 'JSXText', value: toString(node) }
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
    children: mdastChildren.map(mdastNodeToJsxChild),
  }
}

/** Create a slug from a string. */
function createSlug(input: string) {
  return input
    .replace(/([a-z])([A-Z])/g, '$1-$2') // Add a hyphen between lower and upper case letters
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2') // Add a hyphen between consecutive upper case letters followed by a lower case letter
    .replace(/[_\s]+/g, '-') // Replace underscores and spaces with a hyphen
    .toLowerCase() // Convert the entire string to lowercase
}
