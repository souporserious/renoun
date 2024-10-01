import {
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
            fontSize: 'var(--font-size-code-small)',
            lineHeight: 'var(--line-height-code-small)',
          },

          '@media (min-width: 60rem)': {
            width: 'calc(100% + 2rem)',
            margin: '1rem -1rem',
          },
        }}
      >
        <div
          css={{
            '--translate-y': '5%',
            display: 'flex',
            padding: '0.3rem',
            position: 'absolute',
            left: 0,
            top: 'var(--padding-y)',
            translate: `calc(-50% - var(--border-width) * 0.5) var(--translate-y)`,
            backgroundColor: '#82AAFF',
            borderRadius: '100%',

            '@media (min-width: 60rem)': {
              '--translate-y': '-14%',
            },
          }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 -960 960 960"
            css={{
              width: '0.6lh',
              height: '0.6lh',
              fill: '#deedff',

              '@media (min-width: 60rem)': {
                width: '0.8lh',
                height: '0.8lh',
              },
            }}
          >
            <path d="M320-240h320v-80H320v80zm0-160h320v-80H320v80zM240-80q-33 0-56.5-23.5T160-160v-640q0-33 23.5-56.5T240-880h320l240 240v480q0 33-23.5 56.5T720-80H240zm280-520v-200H240v640h480v-440H520zM240-800v200-200 640-640z" />
          </svg>
        </div>
        {typeof children === 'string' ? <p>{children}</p> : children}
      </aside>
    )
  },
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
