import type { Root } from 'mdast'
import type { VFileMessage } from 'vfile-message'

import type { ContentSection } from '../remark/add-sections.js'
import {
  extractMdxTextTree,
  type ExtractMdxTextFormat,
  type ExtractMdxTextSyntax,
  type MdxComponentHandler,
} from './extract-mdx-text.js'
import { collectSections } from './collect-sections.js'

export interface GetStructureOptions {
  source: string
  syntax?: ExtractMdxTextSyntax
  format?: ExtractMdxTextFormat
  componentHandlers?: Record<string, MdxComponentHandler>
}

export interface GetStructureResult {
  tree: Root
  content: string
  frontmatter?: Record<string, unknown>
  diagnostics: VFileMessage[]
  sections: ContentSection[]
}

export async function getStructure(
  options: GetStructureOptions
): Promise<GetStructureResult> {
  const result = await extractMdxTextTree(options)
  const sections = collectSections(result.tree)

  return {
    ...result,
    sections,
  }
}

export async function getMarkdownStructure(
  options: Omit<GetStructureOptions, 'syntax'>
): Promise<GetStructureResult> {
  return getStructure({ ...options, syntax: 'md' })
}

export async function getMDXStructure(
  options: Omit<GetStructureOptions, 'syntax'>
): Promise<GetStructureResult> {
  return getStructure({ ...options, syntax: 'mdx' })
}
