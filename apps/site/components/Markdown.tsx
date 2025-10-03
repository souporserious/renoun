import {
  Code,
  Markdown as DefaultMarkdown,
  rehypePlugins,
  remarkPlugins,
  type MarkdownProps,
} from 'renoun'
import { GeistMono } from 'geist/font/mono'

import { CodeBlock } from './CodeBlock'

export function Markdown(props: MarkdownProps) {
  return (
    <DefaultMarkdown
      {...props}
      components={{
        pre: (preProps) => <CodeBlock {...preProps} />,
        code: (codeProps) => (
          <Code
            variant="inline"
            {...codeProps}
            components={{
              Root: ({ className, children }) => (
                <code
                  className={`${className} ${GeistMono.className}`.trim()}
                  style={{
                    lineHeight: 'var(--line-height-code-2)',
                    color: 'var(--color-foreground-interactive)',
                  }}
                >
                  {children}
                </code>
              ),
            }}
          />
        ),
      }}
      rehypePlugins={rehypePlugins}
      remarkPlugins={remarkPlugins}
    />
  )
}
