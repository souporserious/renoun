import React from 'react'
import type { MDXComponents } from '@renoun/mdx'

import { CodeBlock, parsePreProps } from '../components/CodeBlock/CodeBlock.js'

export function useMDXComponents() {
  return {
    CodeBlock: (props) => <CodeBlock {...parsePreProps(props)} />,
  } satisfies MDXComponents
}
