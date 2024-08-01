import { MDXComponents } from 'mdx/types'
import { CodeBlock } from 'mdxts/components'

export function useMDXComponents() {
  return {
    pre: (props) => {
      const { value, language } = CodeBlock.parsePreProps(props)
      return <CodeBlock allowErrors value={value} language={language} />
    },
  } satisfies MDXComponents
}
