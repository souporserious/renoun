import {
  TypeReference as DefaultTypeReference,
  type TypeReferenceProps,
} from 'renoun/components'
import { Collapse } from 'renoun/components/Collapse/index'
import { styled } from 'restyle'

import { Markdown } from './Markdown'
import { GeistMono } from 'geist/font/mono'

export function TypeReference(props: TypeReferenceProps) {
  return (
    <DefaultTypeReference
      {...props}
      components={{
        section: (props) => (
          <section
            {...props}
            css={{
              display: 'flex',
              flexDirection: 'column',
              gap: '1.6rem',
            }}
          />
        ),
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
              fontSize: 'var(--font-size-body-1)',
              lineHeight: 'var(--line-height-body-1)',
              fontWeight: 'var(--font-weight-body)',
            }}
          />
        ),
        table: (props) => (
          <table
            {...props}
            css={{
              display: 'grid',
              gridTemplateColumns: '0.8fr 1fr auto',
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
              display: 'grid',
              padding: '0.5rem 0',
              whiteSpace: 'nowrap',
              overflowX: 'auto',
              mask: 'linear-gradient(to right, #0000, #ffff var(--start-fade) calc(100% - var(--end-fade)), #0000)',
              animationName: 'scroll-mask',
              animationTimeline: '--scroll-mask',
              scrollTimeline: '--scroll-mask x',

              '&[colspan="3"]': {
                gridColumn: '1 / -1',
              },
            }}
          >
            {props.children}
            <style href="scroll-mask" precedence="scroll-mask">
              {`
                @property --start-fade {
                  syntax: '<length>';
                  inherits: false;
                  initial-value: 0;
                }

                @property --end-fade {
                  syntax: '<length>';
                  inherits: false;
                  initial-value: 0;
                }

                @keyframes scroll-mask {
                  0% {
                    --start-fade: 0rem;
                    --end-fade: 2rem;
                  }
                  8%, 92% {
                    --start-fade: 2rem;
                    --end-fade: 2rem;
                  }
                  100% {
                    --start-fade: 2rem;
                    --end-fade: 0rem;
                  }
                }
              `}
            </style>
          </td>
        ),
        code: (props) => (
          <code
            {...props}
            css={{
              color: 'var(--color-foreground-interactive)',
              wordWrap: 'break-word',
            }}
            className={GeistMono.className}
          />
        ),
        Markdown,
        SubRow: (props) => <StyledCollapse as="tr" {...props} />,
        ...props.components,
      }}
    />
  )
}

const StyledCollapse = styled(Collapse.Content, {
  display: 'grid',
  gridTemplateColumns: 'subgrid',
  gridColumn: '1 / -1',
  borderBottom: '1px solid var(--color-separator)',
})
