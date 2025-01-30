import { CodeBlock, CodeInline, parseCodeProps } from 'renoun/components'
import type { MDXComponents } from 'renoun/mdx'

export function useMDXComponents() {
  return {
    code: (props) => {
      return <CodeInline {...parseCodeProps(props)} />
    },
    pre: (props) => {
      return <CodeBlock {...CodeBlock.parsePreProps(props)} />
    },
  } satisfies MDXComponents
}
