import {
  CodeBlock as BaseCodeBlock,
  type CodeBlockProps,
} from 'renoun/components'
import { GeistMono } from 'geist/font/mono'

export function CodeBlock(props: CodeBlockProps) {
  return (
    <BaseCodeBlock
      {...props}
      css={{
        ...props.css,
        container: {
          fontSize: 'var(--font-size-code)',
          lineHeight: 'var(--line-height-code)',
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