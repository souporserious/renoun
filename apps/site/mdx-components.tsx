import { MDXComponents } from 'mdx/types'
import { CodeBlock, CodeInline } from 'renoun/components'

export function useMDXComponents() {
  return {
    Note: (props) => {
      return (
        <div
          css={{
            backgroundColor: '#1b487d',
            color: 'white',
            padding: '1em',
            borderRadius: 5,
            margin: '1em 0',
          }}
          {...props}
        />
      )
    },
    code: (props) => {
      return (
        <CodeInline
          value={props.children as string}
          language="typescript"
          css={{
            paddingTop: 0,
            paddingBottom: 0,
            lineHeight: 1.2,
            overflowX: 'auto',
          }}
        />
      )
    },
    pre: (props) => {
      const { value, language } = CodeBlock.parsePreProps(props)
      return <CodeBlock allowErrors value={value} language={language} />
    },
  } satisfies MDXComponents
}
