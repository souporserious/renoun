import type { Element, ElementContent } from 'hast'
import type { VFile } from 'vfile'
import type { AsyncReturnType } from 'type-fest'
import type Slugger from 'github-slugger'
import type { Project } from 'ts-morph'
import * as shiki from 'shiki'
import { addCodeMetaProps } from './add-code-meta-props'
import { transformExamples } from './transform-examples'
import { transformSymbolicLinks } from './transform-symbolic-links'
import type { Languages } from './utils'
import { getLanguage } from './utils'

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

export async function getHighlighter({
  languages,
  theme,
}: {
  languages?: Languages
  theme?: string
} = {}) {
  const loadedTheme = await shiki.loadTheme(theme)
  const highlighter = await shiki.getHighlighter({
    theme: loadedTheme,
    langs: languages || defaultLanguages,
  })

  return (code: string, language: shiki.Lang) => {
    try {
      return highlighter.codeToThemedTokens(code, language, null, {
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
  highlighter,
  project,
  onFileData,
}: {
  highlighter: AsyncReturnType<typeof getHighlighter>
  project: Project
  onFileData: (data: FileData) => void
}) {
  return async function transformer(tree: Element, file: VFile) {
    slugs.reset()

    const { hasProperty } = await import('hast-util-has-property')
    const { headingRank } = await import('hast-util-heading-rank')
    const { toString } = await import('hast-util-to-string')
    const headings: Headings = []
    const codeBlocks: CodeBlocks = []
    let previousHeading: Headings[number] | null = null

    await addCodeMetaProps(tree, file)
    await transformSymbolicLinks(tree)
    await transformExamples(tree, project)

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
          const code = toString(node)
          const classNames = (codeNode.properties?.className || []) as string[]
          const language = getLanguage(classNames)

          if (language) {
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
