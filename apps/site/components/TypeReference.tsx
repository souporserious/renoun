import {
  CodeInline,
  TypeReference as DefaultTypeReference,
  parseCodeProps,
  type TypeReferenceProps,
} from 'renoun/components'

import { Markdown } from './Markdown'
import { GeistMono } from 'geist/font/mono'

export function TypeReference(props: TypeReferenceProps) {
  return (
    <DefaultTypeReference
      {...props}
      components={{
        h2: (props) => (
          <h2
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
              display: 'grid',
              gridTemplateColumns: '8rem 1fr 8rem',
              gridColumnGap: '2rem',
              fontSize: 'var(--font-size-body-2)',
              lineHeight: 'var(--line-height-body-2)',
              borderBottom: '1px solid var(--color-separator)',
              borderCollapse: 'collapse',
            }}
          />
        ),
        thead: (props) => (
          <thead
            {...props}
            css={{
              display: 'grid',
              gridTemplateColumns: 'subgrid',
              gridColumn: '1 / -1',
            }}
          />
        ),
        tbody: (props) => (
          <tbody
            {...props}
            css={{
              display: 'grid',
              gridTemplateColumns: 'subgrid',
              gridColumn: '1 / -1',
            }}
          />
        ),
        tr: (props) => (
          <tr
            {...props}
            css={{
              display: 'grid',
              gridTemplateColumns: 'subgrid',
              gridColumn: '1 / -1',
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
            }}
          />
        ),
        code: (props) => {
          return (
            <CodeInline
              {...parseCodeProps(props)}
              language="typescript"
              paddingY="0"
              css={{
                display: 'inline-block',
                maxWidth: '-webkit-fill-available',
                whiteSpace: 'nowrap',
                lineHeight: 1.15,
                overflowX: 'auto',
              }}
              className={GeistMono.className}
            />
          )
        },
        Markdown,
        ...props.components,
      }}
    />
  )
}
