import type { MDXComponents } from '@renoun/mdx'

import { CodeBlock } from '../components/CodeBlock/CodeBlock.js'

export function useMDXComponents() {
  return {
    CodeBlock,
  } satisfies MDXComponents
}
