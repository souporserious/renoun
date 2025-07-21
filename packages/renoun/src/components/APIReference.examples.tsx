/** @jsxImportSource restyle */
import {
  APIReference,
  type APIReferenceComponents,
  Markdown,
} from 'renoun/components'
import { GeistMono } from 'geist/font/mono'

const gaps = {
  small: '0.25rem',
  medium: '0.5rem',
  large: '2rem',
}

const components = {
  Block: ({ gap, ...props }) => (
    <div
      {...props}
      css={{
        display: 'flex',
        flexDirection: 'column',
        gap: gap ? gaps[gap] : undefined,
      }}
    />
  ),
  Inline: ({ gap, ...props }) => (
    <div
      {...props}
      css={{
        display: 'flex',
        flexDirection: 'row',
        gap: gap ? gaps[gap] : undefined,
      }}
    />
  ),
  SectionHeading: (props) => (
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
  Detail: (props) => (
    <div
      {...props}
      css={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
        marginBottom: '1rem',
      }}
    />
  ),
  DetailHeading: (props) => (
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
  Code: (props) => (
    <code
      {...props}
      css={{
        fontFamily: GeistMono.style.fontFamily,
        color: 'var(--color-foreground-interactive)',
      }}
    />
  ),
  Description: (props) => (
    <Markdown
      {...props}
      css={{
        fontSize: 'var(--font-size-body-2)',
        lineHeight: 'var(--line-height-body-2)',
      }}
      components={{
        code: (props) => (
          <code
            {...props}
            css={{
              fontFamily: GeistMono.style.fontFamily,
              color: 'var(--color-foreground-interactive)',
            }}
          />
        ),
      }}
    />
  ),
  Table: (props) => (
    <table
      {...props}
      css={{
        width: '100%',
        tableLayout: 'fixed',
        fontSize: 'var(--font-size-body-2)',
        lineHeight: 'var(--line-height-body-2)',
        borderBottom: '1px solid var(--color-separator)',
        borderCollapse: 'collapse',
      }}
    />
  ),
  TableRow: (props) => (
    <tr
      {...props}
      css={{
        borderBottom: '1px solid var(--color-separator)',
      }}
    />
  ),
  TableHeader: (props) => (
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
  TableData: (props) => (
    <td
      {...props}
      css={{
        width: '100%',
        padding: '0.5rem 0',
        whiteSpace: 'nowrap',
        overflow: 'auto',

        ':nth-child(1)': {
          maxWidth: '30.77%',
        },
        ':nth-child(2)': {
          maxWidth: '38.46%',
        },
        ':nth-child(3)': {
          maxWidth: '30.77%',
        },
      }}
    />
  ),
} satisfies Partial<APIReferenceComponents>

export function BasicUsage() {
  return (
    <div
      css={{
        display: 'flex',
        flexDirection: 'column',
        gap: '3rem',
      }}
    >
      <APIReference
        source="./examples/Button.tsx"
        baseDirectory={import.meta.url}
        components={components}
      />
    </div>
  )
}
