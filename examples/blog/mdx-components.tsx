import { CodeBlock } from 'mdxts/components'

export function useMDXComponents() {
  return {
    pre: (props) => {
      const { value, language } = CodeBlock.parsePreProps(props)
      return <CodeBlock value={value} language={language} />
    },
  }
}
