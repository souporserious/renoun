/** @jsxImportSource restyle */
import {
  TypeReference,
  Markdown,
  CodeBlock,
  CodeInline,
  parsePreProps,
  parseCodeProps,
} from 'renoun/components'
import { rehypePlugins, remarkPlugins } from 'renoun/mdx'
import { GeistMono } from 'geist/font/mono'

export function BasicUsage() {
  return (
    <div
      css={{
        display: 'flex',
        flexDirection: 'column',
        gap: '3rem',
      }}
    >
      <TypeReference
        source="./examples/Button.tsx"
        baseDirectory={import.meta.url}
        components={{
          h3: (props) => (
            <h3
              {...props}
              css={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
                fontSize: 'var(--font-size-heading-2)',
                lineHeight: 'var(--line-height-heading-2)',
                fontWeight: 'var(--font-weight-heading)',
                marginBottom: '1.6rem',

                '& span': {
                  textTransform: 'uppercase',
                  letterSpacing: '0.1rem',
                  fontSize: 'var(--font-size-title)',
                  lineHeight: 1,
                  color: 'var(--color-foreground-secondary)',
                },
              }}
            />
          ),
          h4: (props) => (
            <h4
              {...props}
              css={{
                fontSize: 'var(--font-size-heading-3)',
                lineHeight: 'var(--line-height-heading-3)',
                fontWeight: 'var(--font-weight-heading)',
                marginBottom: '1.6rem',
              }}
            />
          ),
          table: (props) => (
            <table
              {...props}
              css={{
                width: '100%',
                fontSize: 'var(--font-size-body-2)',
                lineHeight: 'var(--line-height-body-2)',
                borderBottom: '1px solid var(--color-separator)',
                borderCollapse: 'collapse',
              }}
            />
          ),
          tr: (props) => (
            <tr
              {...props}
              css={{
                borderBottom: '1px solid var(--color-separator)',
              }}
            />
          ),
          th: (props) => (
            <th
              {...props}
              css={{
                textAlign: 'left',
                fontWeight: 'var(--font-weight-heading)',
                padding: '0.5rem 0',
                color: 'var(--color-foreground)',
              }}
            />
          ),
          td: (props) => (
            <td
              {...props}
              css={{
                padding: '0.5rem 0',
                whiteSpace: 'nowrap',
                overflow: 'auto',
              }}
            />
          ),
          code: (props) => (
            <code
              {...props}
              css={{
                fontFamily: GeistMono.style.fontFamily,
                color: 'var(--color-foreground-interactive)',
              }}
            />
          ),
          Markdown: (props) => (
            <Markdown
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
          ),
        }}
      />
    </div>
  )
}
