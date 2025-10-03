import { Code, type CodeComponents, type CodeProps } from 'renoun'
import { GeistMono } from 'geist/font/mono'

type SiteCodeBlockProps = Extract<CodeProps, { variant?: 'block' }>

export function CodeBlock(props: SiteCodeBlockProps) {
  const { components, ...restProps } = props as SiteCodeBlockProps & {
    components?: CodeComponents['Block']['components']
  }

  return (
    <Code
      {...restProps}
      components={{
        Container: ({ children, className }) => {
          return (
            <div
              className={`${GeistMono.className}${className ? ` ${className}` : ''}`}
              css={{
                '--padding-x': '1rem',
                '--padding-y': '0.75rem',
                fontSize: 'var(--font-size-code-2)',
                lineHeight: 'var(--line-height-code-2)',
                width: 'calc(100% + 2rem)',
                margin: '0 -1rem',
              }}
            >
              {children}
            </div>
          )
        },
        ...components,
      }}
    />
  )
}
