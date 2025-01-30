import {
  CodeBlock as RenounCodeBlock,
  CodeInline,
  PackageInstall,
  parseCodeProps,
  parsePreProps,
} from 'renoun/components'
import type { MDXComponents as MDXComponentsType } from 'renoun/mdx'
import { GeistMono } from 'geist/font/mono'

import { Card } from './Card'
import { CodeBlock } from './CodeBlock'
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
            fontSize: 'var(--font-size-code-2)',
            lineHeight: 'var(--line-height-code-2)',
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
  Note: ({ children }) => {
    return (
      <aside
        css={{
          '--padding-x': '1.5rem',
          '--padding-y': '1rem',
          '--border-width': '5px',
          display: 'flex',
          flexDirection: 'column',
          padding: 'var(--padding-y) var(--padding-x)',
          gap: '1rem',
          backgroundColor: '#1b487d',
          color: 'white',
          borderLeft: 'var(--border-width) solid #82aaff',
          borderRadius: 5,
          position: 'relative',

          '& p': {
            fontSize: 'var(--font-size-body-2) !important',
            lineHeight: 'var(--line-height-body-2) !important',
            textWrap: 'pretty',
          },

          '& pre': {
            fontSize: 'var(--font-size-code-3)',
            lineHeight: 'var(--line-height-code-3)',
          },

          '@media (min-width: 60rem)': {
            width: 'calc(100% + 2rem)',
            margin: '1rem -1rem',
          },
        }}
      >
        {children}
      </aside>
    )
  },
  code: (props) => {
    return (
      <CodeInline
        {...parseCodeProps(props)}
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
  pre: (props) => {
    return <CodeBlock {...parsePreProps(props)} shouldFormat={false} />
  },
} satisfies MDXComponentsType
