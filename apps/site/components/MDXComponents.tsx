import {
  Code,
  Command,
  type CommandVariant,
  type MDXComponents as MDXComponentsType,
} from 'renoun'
import { GeistMono } from 'geist/font/mono'

import { Card } from './Card'
import { CodeBlock } from './CodeBlock'
import { Row } from './Row'

export const MDXComponents = {
  Card,
  CodeBlock,
  Row,
  ul: (props) => {
    return (
      <ul
        {...props}
        css={{
          display: 'grid',
          gap: '0.375rem',
          margin: '1rem 0',
          paddingInlineStart: '1.25rem',
          listStyleType: 'disc',

          // Nested unordered list styles
          '& ul': {
            marginTop: '0.375rem',
            listStyleType: 'circle',
            paddingInlineStart: '1.25rem',
          },
          '& ul ul': {
            listStyleType: 'square',
          },

          // Marker styling
          '& li::marker': {
            color: 'var(--color-foreground)',
          },
        }}
      />
    )
  },
  ol: (props) => {
    return (
      <ol
        {...props}
        css={{
          display: 'grid',
          gap: '0.375rem',
          margin: '1rem 0',
          paddingInlineStart: '1.25rem',
          listStyleType: 'decimal',

          // Nested ordered list styles
          '& ol': {
            marginTop: '0.375rem',
            listStyleType: 'lower-alpha',
            paddingInlineStart: '1.25rem',
          },
          '& ol ol': {
            listStyleType: 'lower-roman',
          },

          // Marker styling
          '& li::marker': {
            color: 'var(--color-foreground)',
            fontVariantNumeric: 'tabular-nums',
          },
        }}
      />
    )
  },
  li: (props) => {
    return (
      <li
        {...props}
        css={{
          // Tighten default spacing and keep nested lists readable
          paddingInlineStart: '0.125rem',
          '& > p': { margin: 0 },
          '& > ul, & > ol': {
            marginTop: '0.375rem',
          },
        }}
      />
    )
  },
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
  Command: ({
    children,
    variant,
  }: {
    children: React.ReactNode
    variant: CommandVariant
  }) => {
    return (
      <Command
        variant={variant}
        components={{
          Container: ({ id, className, children: containerChildren }) => {
            const classes = [className, GeistMono.className]
              .filter(Boolean)
              .join(' ')

            return (
              <div
                data-command-group={id}
                className={classes}
                css={{
                  fontSize: 'var(--font-size-code-2)',
                  lineHeight: 'var(--line-height-code-2)',
                  width: 'calc(100% + 2rem)',
                  margin: '0 -1rem',
                }}
              >
                {containerChildren}
              </div>
            )
          },
          TabPanel: ({
            id,
            tabId,
            panelId,
            packageManager,
            command,
            isSelected,
            className,
            children: panelChildren,
          }) => {
            return (
              <pre
                role="tabpanel"
                id={panelId}
                hidden={!isSelected}
                aria-labelledby={tabId}
                data-command={packageManager}
                data-command-tab-panel={command}
                data-command-group={id}
                className={className}
                suppressHydrationWarning
                css={{ padding: '0.75rem 1rem' }}
              >
                {panelChildren}
              </pre>
            )
          },
        }}
      >
        {children}
      </Command>
    )
  },
  Note: ({ children }) => {
    return (
      <aside
        css={{
          '--padding-x': '1.5rem',
          '--padding-y': '1rem',
          display: 'flex',
          flexDirection: 'column',
          padding: 'var(--padding-y) var(--padding-x)',
          gap: '1rem',
          backgroundColor: '#1b487d',
          color: 'white',
          borderLeft: '5px solid #82aaff',
          borderRadius: 5,
          position: 'relative',

          '& a': {
            color: '#b1d5ff',
          },

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
      <Code
        variant="inline"
        {...props}
        components={{
          Root: ({ className, children }) => (
            <code
              className={`${className} ${GeistMono.className}`.trim()}
              css={{
                lineHeight: 1.15,
                overflowX: 'auto',
                color: '#82AAFF',
                padding: '0 0.25em 0',
              }}
            >
              {children}
            </code>
          ),
        }}
      />
    )
  },
} satisfies MDXComponentsType
