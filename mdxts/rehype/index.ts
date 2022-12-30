import type { Element, ElementContent } from 'hast'
import type { AsyncReturnType } from 'type-fest'
import type Slugger from 'github-slugger'
import * as shiki from 'shiki'

let slugs: Slugger

import('github-slugger').then(({ default: Slugger }) => {
  slugs = new Slugger()
})

function tokensToHast(lines: shiki.IThemedToken[][]) {
  const tree: ElementContent[] = []

  lines.forEach((line) => {
    if (line.length === 0) {
      tree.push({ type: 'text', value: '\n' })
    } else {
      line.forEach((token) => {
        let style = `color: ${token.color};`

        if (token.fontStyle === shiki.FontStyle.Italic) {
          style += ' font-style: italic;'
        }
        if (token.fontStyle === shiki.FontStyle.Bold) {
          style += ' font-weight: bold;'
        }
        if (token.fontStyle === shiki.FontStyle.Underline) {
          style += ' text-decoration: underline;'
        }

        tree.push({
          type: 'element',
          tagName: 'span',
          properties: { style },
          children: [{ type: 'text', value: token.content }],
        })
      })

      tree.push({ type: 'text', value: '\n' })
    }
  })

  tree.pop()

  return tree
}

type Languages = shiki.Lang[]

const defaultLanguages: Languages = [
  'html',
  'css',
  'markdown',
  'md',
  'mdx',
  'js',
  'jsx',
  'ts',
  'tsx',
  'bash',
  'json',
  'yaml',
]

function getLanguage(className: string[] = []) {
  const language = className.find((name) => name.startsWith('language-'))

  return (language ? language.slice(9) : null) as Languages[number] | null
}

export async function getHighlighter(
  languages: Languages = defaultLanguages,
  theme = 'nord'
) {
  // TODO: add support for custom themes and add createCSSVariablesTheme helper
  // const loadedTheme = await shiki.loadTheme(theme)
  // const theme = 'css-variables'
  const highlighter = await shiki.getHighlighter({
    theme,
    langs: languages,
  })

  return (code: string, language: shiki.Lang) => {
    try {
      return highlighter.codeToThemedTokens(code, language, theme, {
        includeExplanation: false,
      })
    } catch (error) {
      throw new Error(
        `Error highlighting code block with language "${language}" make sure the language is configured in the mdxts config.\n${error}`
      )
    }
  }
}

export type Headings = {
  id: any
  text: string
  depth: number
}[]

export type CodeBlocks = {
  text: string
  heading: Headings[number] | null
  language: shiki.Lang
  tokens: shiki.IThemedToken[][]
}[]

export type FileData = {
  path: string
  headings: Headings
  codeBlocks: CodeBlocks
}

export function rehypePlugin({
  onFileData,
  highlighter,
}: {
  onFileData: (data: FileData) => void
  highlighter: AsyncReturnType<typeof getHighlighter>
}) {
  return async function transformer(tree: Element, file: any) {
    slugs.reset()

    const { hasProperty } = await import('hast-util-has-property')
    const { headingRank } = await import('hast-util-heading-rank')
    const { toString } = await import('hast-util-to-string')
    const { u } = await import('unist-builder')
    const { visitParents } = await import('unist-util-visit-parents')
    const headings: Headings = []
    const codeBlocks: CodeBlocks = []
    let previousHeading: Headings[number] | null = null

    /** Replace all symbolic links [[link]] with jsx links <a href="/link">link</a>. */
    visitParents(tree, 'text', (node, ancestors) => {
      const matches = node.value.match(/\[\[(.+?)\]\]/g)

      if (!matches) {
        return
      }

      const splitNodes: any[] = []
      let lastIndex = 0

      for (const match of matches) {
        const index = node.value.indexOf(match, lastIndex)
        const linkText = match.slice(2, -2)

        splitNodes.push(u('text', node.value.slice(lastIndex, index)))

        splitNodes.push({
          type: 'mdxJsxTextElement',
          name: 'a',
          attributes: [
            {
              type: 'mdxJsxAttribute',
              name: 'href',
              value: '#',
            },
          ],
          children: [
            {
              type: 'text',
              value: linkText,
            },
          ],
        })

        lastIndex = index + match.length
      }

      splitNodes.push(u('text', node.value.slice(lastIndex)))

      ancestors[ancestors.length - 1].children = splitNodes
    })

    /** Gather headings and code blocks to analyze. */
    tree.children.forEach((node) => {
      if (node.type !== 'element') return

      const depth = headingRank(node)

      if (depth && node.properties) {
        if (!hasProperty(node, 'id')) {
          node.properties.id = slugs.slug(toString(node))
        }

        const heading = {
          depth,
          id: node.properties.id,
          text: node.children.map((child) => toString(child)).join(''),
        }

        headings.push(heading)

        previousHeading = heading
      }

      if (node.tagName === 'pre') {
        const codeNode = node.children[0]

        if (
          codeNode &&
          codeNode.type === 'element' &&
          codeNode.tagName === 'code' &&
          codeNode.properties
        ) {
          const classNames = (codeNode.properties?.className || []) as string[]
          const language = getLanguage(classNames)

          if (language) {
            const code = toString(node)
            const tokens = highlighter(code, language)

            codeBlocks.push({
              text: code,
              heading: previousHeading,
              language,
              tokens,
            })

            node.children = tokensToHast(tokens)
          }
        }
      }
    })

    onFileData?.({
      path: file.path,
      headings,
      codeBlocks,
    })
  }
}
