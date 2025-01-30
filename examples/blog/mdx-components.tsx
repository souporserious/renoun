import { CodeBlock, CodeInline, parseCodeProps } from 'renoun/components'
import type { MDXComponents } from 'renoun/mdx'

export function useMDXComponents() {
  return {
    code: (props) => {
      return <CodeInline {...parseCodeProps(props)} />
    },
    pre: (props) => {
      const { value, language } = CodeBlock.parsePreProps(props)
      return <CodeBlock value={value} language={language} />
    },
  } satisfies MDXComponents
}
