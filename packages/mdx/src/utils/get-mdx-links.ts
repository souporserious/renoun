import { createProcessor } from '@mdx-js/mdx'

interface MDXNode {
  type: string
  value?: string
  url?: string
  identifier?: string
  label?: string
  name?: string
  attributes?: unknown[]
  children?: MDXNode[]
  position?: {
    start?: LinkPosition
  }
}

export type LinkSource = 'markdown' | 'reference' | 'jsx'

export type LinkKind = 'literal' | 'dynamic'

export interface LinkPosition {
  line?: number
  column?: number
}

export interface MDXLinkOccurrence {
  url: string
  filePath: string
  position?: LinkPosition
  source: LinkSource
  kind: LinkKind
}

interface HrefAttributeLiteral {
  kind: 'literal'
  value: string
}

interface HrefAttributeDynamic {
  kind: 'dynamic'
  raw: string
}

type HrefAttribute = HrefAttributeLiteral | HrefAttributeDynamic

/**
 * Parse an MDX source string and collect all link occurrences found in markdown links,
 * reference links, and JSX href attributes.
 */
export function getMDXLinks(
  source: string,
  filePath: string
): MDXLinkOccurrence[] {
  const tree = createProcessor().parse(source) as MDXNode

  const definitions = new Map<string, string>()
  gatherDefinitions(tree, definitions)

  const occurrences: MDXLinkOccurrence[] = []
  collectMdxLinks(tree, definitions, filePath, occurrences)
  return occurrences
}

function gatherDefinitions(node: MDXNode, definitions: Map<string, string>) {
  if (
    node.type === 'definition' &&
    node.identifier &&
    typeof node.url === 'string'
  ) {
    definitions.set(node.identifier.toLowerCase(), node.url)
  }

  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      gatherDefinitions(child, definitions)
    }
  }
}

function collectMdxLinks(
  node: MDXNode,
  definitions: Map<string, string>,
  filePath: string,
  results: MDXLinkOccurrence[],
  source: LinkSource = 'markdown'
) {
  if (node.type === 'link' && typeof node.url === 'string') {
    results.push(
      createLinkOccurrence(
        node.url,
        filePath,
        node.position?.start,
        'markdown',
        'literal'
      )
    )
  } else if (node.type === 'linkReference') {
    const identifier = node.identifier ?? node.label
    if (identifier) {
      const resolved = definitions.get(identifier.toLowerCase())
      if (typeof resolved === 'string') {
        results.push(
          createLinkOccurrence(
            resolved,
            filePath,
            node.position?.start,
            'reference',
            'literal'
          )
        )
      }
    }
  } else if (
    (node.type === 'mdxJsxFlowElement' || node.type === 'mdxJsxTextElement') &&
    Array.isArray(node.attributes)
  ) {
    const href = extractHrefAttribute(node.attributes)
    if (href) {
      if (href.kind === 'literal') {
        results.push(
          createLinkOccurrence(
            href.value,
            filePath,
            node.position?.start,
            'jsx',
            'literal'
          )
        )
      } else {
        results.push(
          createLinkOccurrence(
            href.raw,
            filePath,
            node.position?.start,
            'jsx',
            'dynamic'
          )
        )
      }
    }
  }

  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      collectMdxLinks(child, definitions, filePath, results, source)
    }
  }
}

function extractHrefAttribute(
  attributes: unknown[]
): HrefAttribute | undefined {
  for (const attribute of attributes) {
    if (!attribute || typeof attribute !== 'object') {
      continue
    }

    const { type, name } = attribute as { type?: string; name?: string }
    if (type !== 'mdxJsxAttribute' || name !== 'href') {
      continue
    }

    const value = (attribute as { value?: unknown }).value

    if (typeof value === 'string') {
      return { kind: 'literal', value }
    }

    if (value && typeof value === 'object') {
      const typed = value as { type?: string; value?: string }
      if (
        typed.type === 'mdxJsxAttributeValueLiteral' &&
        typeof typed.value === 'string'
      ) {
        return { kind: 'literal', value: typed.value }
      }
      if (typeof typed.value === 'string') {
        return { kind: 'dynamic', raw: typed.value }
      }
    }

    if (typeof value === 'boolean') {
      return { kind: 'dynamic', raw: String(value) }
    }
  }

  return undefined
}

function createLinkOccurrence(
  url: string,
  filePath: string,
  position: LinkPosition | undefined,
  source: LinkSource,
  kind: LinkKind
): MDXLinkOccurrence {
  return {
    url,
    filePath,
    position: position
      ? { line: position.line, column: position.column }
      : undefined,
    source,
    kind,
  }
}
