import { CodeBlock, CodeInline } from 'renoun/components'
import type { MDXComponents } from 'renoun/mdx'

export function useMDXComponents() {
  return {
    code: (props) => {
      const { value, language } = CodeInline.parseCodeProps(props)
      return <CodeInline value={value} language={language} />
    },
    pre: (props) => {
      const { value, language } = CodeBlock.parsePreProps(props)
      return <CodeBlock value={value} language={language} />
    },
  } satisfies MDXComponents
}
