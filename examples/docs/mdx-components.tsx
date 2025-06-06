import {
  CodeBlock,
  CodeInline,
  parsePreProps,
  parseCodeProps,
} from 'renoun/components'
import type { MDXComponents } from 'renoun/mdx'

export function useMDXComponents() {
  return {
    pre: (props) => {
      return <CodeBlock {...parsePreProps(props)} />
    },
    code: (props) => {
      return <CodeInline {...parseCodeProps(props)} />
    },
  } satisfies MDXComponents
}
