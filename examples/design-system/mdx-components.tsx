import { CodeBlock, parsePreProps } from 'renoun/components'
import type { MDXComponents } from 'renoun/mdx'

export function useMDXComponents() {
  return {
    pre: (props) => <CodeBlock {...parsePreProps(props)} />,
  } satisfies MDXComponents
}
