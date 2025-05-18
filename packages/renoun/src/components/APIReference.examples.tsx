/** @jsxImportSource restyle */
import {
  TypeReference,
  type TypeReferenceComponents,
  Markdown,
  CodeBlock,
  CodeInline,
  parsePreProps,
  parseCodeProps,
} from 'renoun/components'
import { rehypePlugins, remarkPlugins } from 'renoun/mdx'

const theme = {
  color: {
    text: '#000',
    textMuted: '#737373',
    border: '#e5e5e5',
    borderDark: '#2a2a2a',
    hover: 'rgba(0,0,0,0.04)',
    hoverDark: 'rgba(255,255,255,0.05)',
  },
  font: {
    body: { fontSize: 14 },
    heading: { fontSize: 20, fontWeight: 600 },
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 24,
    xl: 32,
    sectionGap: 96,
  },
} as const

const components = {
  section: (props) => (
    <section
      {...props}
      css={{
        containerType: 'inline-size',
        marginTop: theme.spacing.sectionGap,
        paddingBottom: theme.spacing.xl,
        borderBottom: `1px solid ${theme.color.border}`,
        ':first-of-type': { marginTop: 0 },
        '@media (prefers-color-scheme: dark)': {
          borderBottom: `1px solid ${theme.color.borderDark}`,
        },
      }}
    />
  ),
  p: (props) => (
    <p
      {...props}
      css={{
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        fontSize: 12,
        color: theme.color.textMuted,
        marginBottom: theme.spacing.sm,
      }}
    />
  ),
  h2: (props) => (
    <h2
      {...props}
      css={{
        fontSize: theme.font.heading.fontSize,
        fontWeight: theme.font.heading.fontWeight,
        marginBottom: theme.spacing.xl,
      }}
    />
  ),
  h4: (props) => (
    <h4
      {...props}
      css={{
        fontWeight: 500,
        marginTop: theme.spacing.lg,
        marginBottom: theme.spacing.xs,
      }}
    />
  ),
  table: (props) => (
    <table
      {...props}
      css={{
        width: '100%',
        fontSize: theme.font.body.fontSize,
        borderBottom: `1px solid ${theme.color.border}`,
        '@media (prefers-color-scheme: dark)': {
          borderBottom: `1px solid ${theme.color.borderDark}`,
        },
      }}
    />
  ),
  tr: (props) => (
    <tr
      {...props}
      css={{
        borderBottom: `1px solid ${theme.color.border}`,
        '@media (prefers-color-scheme: dark)': {
          borderBottom: `1px solid ${theme.color.borderDark}`,
        },
        ':last-child': { borderBottom: 'none' },
      }}
    />
  ),
  th: (props) => (
    <th
      {...props}
      css={{
        fontWeight: 500,
        padding: `${theme.spacing.sm}px 0`,
        color: theme.color.textMuted,
      }}
    />
  ),
  td: (props) => <td {...props} css={{ padding: theme.spacing.sm }} />,
  summary: (props) => <summary {...props} css={{ cursor: 'pointer' }} />,
  code: (props) => <code {...props} css={{ fontFamily: 'monospace' }} />,
  Markdown: (props) => (
    <Markdown
      components={{
        pre: (preProps) => <CodeBlock {...parsePreProps(preProps)} />,
        code: (codeProps) => <CodeInline {...parseCodeProps(codeProps)} />,
      }}
      rehypePlugins={rehypePlugins}
      remarkPlugins={remarkPlugins}
      {...props}
    />
  ),
} satisfies Partial<TypeReferenceComponents>

export function Table() {
  return (
    <div css={{ width: '100%' }}>
      <TypeReference
        source="./examples/Button.tsx"
        baseDirectory={import.meta.url}
        components={components}
      />
    </div>
  )
}
