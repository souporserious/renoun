import {
  CodeInline,
  Markdown as DefaultMarkdown,
  parseCodeProps,
  parsePreProps,
  type MarkdownProps,
} from 'renoun/components'
import { rehypePlugins, remarkPlugins } from 'renoun/mdx'
import { GeistMono } from 'geist/font/mono'

import { CodeBlock } from './CodeBlock'

export function Markdown(props: MarkdownProps) {
  return (
    <DefaultMarkdown
      {...props}
      components={{
        pre: (preProps) => <CodeBlock {...parsePreProps(preProps)} />,
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
      rehypePlugins={rehypePlugins}
      remarkPlugins={remarkPlugins}
    />
  )
}
