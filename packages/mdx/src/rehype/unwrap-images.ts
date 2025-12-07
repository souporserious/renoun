import type { Element, Nodes, Root } from 'hast'
import { visit, SKIP } from 'unist-util-visit'

const UNKNOWN = 1
const CONTAINS_IMAGE = 2
const CONTAINS_OTHER = 3

export default function rehypeUnwrapImages() {
  return (tree: Root) => {
    visit(tree, 'element', (node, index, parent) => {
      if (
        node.tagName === 'p' &&
        parent &&
        typeof index === 'number' &&
        applicable(node, false) === CONTAINS_IMAGE
      ) {
        parent.children.splice(index, 1, ...node.children)
        return [SKIP, index]
      }
    })
  }
}

function applicable(node: Element, inLink: boolean): number {
  let image = UNKNOWN

  for (let index = 0; index < node.children.length; index += 1) {
    const child = node.children[index]

    if (child.type === 'text' && isWhitespace(child.value)) {
      continue
    }

    if (child.type === 'element' && child.tagName === 'img') {
      image = CONTAINS_IMAGE
      continue
    }

    if (!inLink && isInteractive(child)) {
      const linkResult = applicable(child as Element, true)

      if (linkResult === CONTAINS_OTHER) return CONTAINS_OTHER
      if (linkResult === CONTAINS_IMAGE) image = CONTAINS_IMAGE
      continue
    }

    return CONTAINS_OTHER
  }

  return image
}

function isInteractive(node: Nodes): boolean {
  if (node.type !== 'element') return false

  const properties = node.properties || {}

  switch (node.tagName) {
    case 'a':
      return Boolean(properties.href)
    case 'audio':
    case 'video':
      return Boolean(properties.controls)
    case 'object':
    case 'img':
      return Boolean(properties.useMap)
    case 'input':
      return properties.type !== 'hidden'
    default:
      return (
        properties.tabIndex !== undefined ||
        ALWAYS_INTERACTIVE.has(node.tagName as string)
      )
  }
}

function isWhitespace(value: string): boolean {
  return value.replace(ASCII_WHITESPACE, '') === ''
}

const ASCII_WHITESPACE = /[ \t\n\f\r]/g
const ALWAYS_INTERACTIVE = new Set([
  'button',
  'details',
  'embed',
  'iframe',
  'keygen',
  'label',
  'select',
  'textarea',
])
