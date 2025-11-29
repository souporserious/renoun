import {
  CodeInline,
  Markdown as DefaultMarkdown,
  parseCodeProps,
  type MarkdownProps,
} from 'renoun'
import { GeistMono } from 'geist/font/mono'

import { CodeBlock } from './CodeBlock'

export function Markdown(props: MarkdownProps) {
  return (
    <DefaultMarkdown
      {...props}
      components={{
        CodeBlock,
        code: (codeProps) => (
          <CodeInline
            {...parseCodeProps(codeProps)}
            css={{
              lineHeight: 'var(--line-height-code-2)',
              color: 'var(--color-foreground-interactive)',
            }}
            className={GeistMono.className}
          />
        ),
      }}
    />
  )
}
