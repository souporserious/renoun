import { MDXComponents } from 'mdx/types'
import { CodeBlock, CodeInline } from 'omnidoc/components'

export function useMDXComponents() {
  return {
    code: (props) => {
      return (
        <CodeInline value={props.children as string} language="typescript" />
      )
    },
    pre: (props) => {
      const { value, language } = CodeBlock.parsePreProps(props)
      return <CodeBlock allowErrors value={value} language={language} />
    },
  } satisfies MDXComponents
}
