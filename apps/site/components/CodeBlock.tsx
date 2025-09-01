import { CodeBlock as DefaultCodeBlock, type CodeBlockProps } from 'renoun'
import { GeistMono } from 'geist/font/mono'

export function CodeBlock(props: CodeBlockProps) {
  return (
    <DefaultCodeBlock
      {...props}
      css={{
        ...props.css,
        container: {
          fontSize: 'var(--font-size-code-2)',
          lineHeight: 'var(--line-height-code-2)',
          width: 'calc(100% + 2rem)',
          padding: '0.75rem 1rem',
          margin: '0 -1rem',
          ...props.css?.container,
        },
        toolbar: {
          padding: '0.75rem 1rem',
          ...props.css?.toolbar,
        },
      }}
      className={{
        container: GeistMono.className,
      }}
    />
  )
}
