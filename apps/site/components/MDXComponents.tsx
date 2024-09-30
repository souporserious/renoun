import {
  Callout,
  CodeBlock,
  CodeInline,
  PackageInstall,
  type MDXComponents as MDXComponentsType,
} from 'renoun/components'
import { GeistMono } from 'geist/font/mono'

import { Card } from './Card'
import { Row } from './Row'

export const MDXComponents = {
  Card,
  Row,
  Preview: ({ children }: { children: React.ReactNode }) => {
    return (
      <div
        css={{
          display: 'grid',
          padding: '3rem',
          borderRadius: 5,
          boxShadow: '0 0 0 1px var(--color-separator)',
          backgroundColor: 'var(--color-background)',
          backgroundSize: '1rem 1rem',
          backgroundImage: `radial-gradient(circle, var(--color-separator) 1px, transparent 1px)`,
        }}
      >
        {children}
      </div>
    )
  },
  PackageInstall: ({ packages }: { packages: string[] }) => {
    return (
      <PackageInstall
        packages={packages}
        css={{
          container: {
            fontSize: 'var(--font-size-code)',
            lineHeight: 'var(--line-height-code)',
            width: 'calc(100% + 2rem)',
            margin: '0 -1rem',
          },
          tabPanel: {
            padding: '0.75rem 1rem',
          },
        }}
        className={{
          container: GeistMono.className,
        }}
      />
    )
  },
  Note: (props) => (
    <Callout
      css={{
        width: 'calc(100% + 2rem)',
        margin: '1rem -1rem',
      }}
      {...props}
    />
  ),
  code: (props) => {
    return (
      <CodeInline
        value={props.children as string}
        paddingY="0"
        css={{
          lineHeight: 1.15,
          overflowX: 'auto',
          color: '#82AAFF',
        }}
        className={GeistMono.className}
      />
    )
  },
  pre: ({ allowErrors, value, language, highlightedLines, focusedLines }) => {
    return (
      <CodeBlock
        allowErrors={allowErrors}
        value={value}
        language={language}
        highlightedLines={highlightedLines}
        focusedLines={focusedLines}
        css={{
          container: {
            fontSize: 'var(--font-size-code)',
            lineHeight: 'var(--line-height-code)',
            width: 'calc(100% + 2rem)',
            padding: '0.75rem 1rem',
            margin: '0 -1rem',
          },
          toolbar: {
            padding: '0.75rem 1rem',
          },
        }}
        className={{
          container: GeistMono.className,
        }}
      />
    )
  },
} satisfies MDXComponentsType
