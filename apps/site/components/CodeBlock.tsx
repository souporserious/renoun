import { Code, type CodeComponents, type CodeProps } from 'renoun'
import { GeistMono } from 'geist/font/mono'

function Container({
  children,
  className,
}: CodeComponents['BlockContainer']) {
  return (
    <div
      className={`${GeistMono.className}${className ? ` ${className}` : ''}`}
      style={{
        fontSize: 'var(--font-size-code-2)',
        lineHeight: 'var(--line-height-code-2)',
        width: 'calc(100% + 2rem)',
        padding: '0.75rem 1rem',
        margin: '0 -1rem',
      }}
    >
      {children}
    </div>
  )
}

type SiteCodeBlockProps = Extract<CodeProps, { variant?: 'block' }>

export function CodeBlock(props: SiteCodeBlockProps) {
  const { components, ...restProps } =
    props as SiteCodeBlockProps & {
      components?: CodeComponents['Block']['components']
    }

  return (
    <Code
      {...restProps}
      variant="block"
      components={{
        Container,
        ...(components ?? {}),
      }}
    />
  )
}
