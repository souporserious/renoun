import { MDXComponents } from 'mdx/types'
import { CodeBlock, CodeInline } from 'renoun/components'
import { GeistMono } from 'geist/font/mono'

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
          paddingY="0"
          css={{
            lineHeight: 1.2,
            overflowX: 'auto',
          }}
          className={GeistMono.className}
        />
      )
    },
    pre: (props) => {
      const { value, language } = CodeBlock.parsePreProps(props)
      return (
        <CodeBlock
          allowErrors
          value={value}
          language={language}
          css={{
            container: {
              fontSize: 'var(--font-size-code)',
              lineHeight: 'var(--line-height-code)',
              width: 'calc(100% + 2rem)',
              padding: '1rem',
              margin: '0 -1rem',
            },
            toolbar: {
              padding: '0.8rem 1rem',
            },
          }}
          className={{
            container: GeistMono.className,
          }}
        />
      )
    },
  } satisfies MDXComponents
}
