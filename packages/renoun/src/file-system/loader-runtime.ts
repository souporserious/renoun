import * as React from 'react'
import type { MDXContent, MDXComponents } from '@renoun/mdx'
import { rehypePlugins } from '@renoun/mdx/rehype'
import { remarkPlugins } from '@renoun/mdx/remark'
import { getMDXContent, parseFrontmatter } from '@renoun/mdx/utils'

import { CodeBlock } from '../components/CodeBlock/index.ts'
import { Markdown, type MarkdownComponents } from '../components/Markdown.tsx'

export const markdownComponents = {
  CodeBlock,
} satisfies MDXComponents & MarkdownComponents

export const defaultLoaders: Record<string, (path: string, file: any) => any> =
  {
    md: async (_path: string, file: any) => {
      const value = await file.getText()
      const frontmatter =
        'getFrontmatter' in file && typeof file.getFrontmatter === 'function'
          ? await file.getFrontmatter()
          : undefined

      return {
        default: () =>
          React.createElement(Markdown, {
            components: markdownComponents,
            children: value,
          }),
        frontmatter,
      }
    },

    mdx: async (_path: string, file: any) => {
      const fileSystem = file.getParent().getFileSystem()
      let source: string

      try {
        source = await fileSystem.readFile(file.workspacePath)
      } catch (relativeError) {
        try {
          source = await fileSystem.readFile(file.absolutePath)
        } catch {
          throw relativeError
        }
      }

      const {
        default: Content,
        frontmatter: exportedFrontmatter,
        ...mdxExports
      } = await getMDXContent({
        source,
        remarkPlugins,
        rehypePlugins,
      })

      let frontmatter = exportedFrontmatter as
        | Record<string, unknown>
        | undefined

      if (frontmatter === undefined) {
        frontmatter = parseFrontmatter(source).frontmatter
      }

      return {
        default: () =>
          React.createElement(Content, { components: markdownComponents }),
        frontmatter,
        ...mdxExports,
      }
    },
  }

export type DefaultLoaderModule = {
  default: MDXContent
  frontmatter?: Record<string, unknown>
  [key: string]: unknown
}
