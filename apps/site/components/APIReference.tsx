import type { JavaScriptFileExport } from 'renoun/file-system'
import {
  APIReference as DefaultAPIReference,
  type APIReferenceProps,
} from 'renoun/components'
import { Collapse } from 'renoun/components/Collapse/index'
import { styled } from 'restyle'
import { GeistMono } from 'geist/font/mono'

export function APIReferences({
  fileExports,
}: {
  fileExports: JavaScriptFileExport<any>[]
}) {
  return (
    <div
      css={{
        display: 'flex',
        flexDirection: 'column',

        '& > *:not(:last-child)': {
          borderBottom: '1px solid var(--color-separator)',
        },
      }}
    >
      {fileExports.map((fileExport) => (
        <APIReference key={fileExport.getName()} source={fileExport} />
      ))}
    </div>
  )
}

export function APIReference(props: APIReferenceProps) {
  return (
    <DefaultAPIReference
      {...props}
      components={{
        section: (props) => (
          <section
            {...props}
            css={{
              display: 'flex',
              flexDirection: 'column',
            }}
          />
        ),
        h3: (props) => (
          <h3
            {...props}
            css={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
              fontSize: 'var(--font-size-heading-3)',
              lineHeight: 'var(--line-height-heading-3)',
              fontWeight: 'var(--font-weight-heading)',

              '& span': {
                textTransform: 'uppercase',
                letterSpacing: '0.1rem',
                fontSize: 'var(--font-size-title)',
                lineHeight: 1,
                color: 'var(--color-foreground-secondary)',
              },
            }}
          >
            <StyledTrigger>
              <svg
                viewBox="0 0 12 12"
                css={{
                  position: 'absolute',
                  width: 16,
                  height: 16,
                  top: '3.2rem',
                  left: '-2rem',
                  transition: 'transform 0.2s ease',

                  '[aria-expanded="true"] &': {
                    transform: 'rotate(90deg)',
                  },
                }}
              >
                <path d="M3 2l4 4-4 4" fill="none" stroke="currentColor" />
              </svg>
              {props.children}
            </StyledTrigger>
          </h3>
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
              width: '100%',
              tableLayout: 'fixed',
              fontSize: 'var(--font-size-body-2)',
              lineHeight: 'var(--line-height-body-2)',
              borderBottom: '1px solid var(--color-separator)',
              borderCollapse: 'collapse',

              'th, td': {
                padding: '0.5rem 0',
              },
              'th + th, td + td': {
                paddingLeft: '1rem',
              },
            }}
          />
        ),
        tr: (props) =>
          props['data-subrow'] ? (
            <StyledCollapse as="tr" {...props} />
          ) : (
            <tr
              {...props}
              css={{
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
              color: 'var(--color-foreground)',
            }}
          />
        ),
        td: (props) => (
          <td
            {...props}
            css={{
              whiteSpace: 'nowrap',
              overflowX: 'auto',
              mask: 'linear-gradient(to right, #0000, #ffff var(--start-fade) calc(100% - var(--end-fade)), #0000)',
              animationName: 'scroll-mask',
              animationTimeline: '--scroll-mask',
              scrollTimeline: '--scroll-mask x',

              ':nth-child(1)': {
                width: '30.77%',
              },
              ':nth-child(2)': {
                width: '38.46%',
              },
              ':nth-child(3)': {
                width: '30.77%',
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
        ...props.components,
      }}
    />
  )
}

const StyledTrigger = styled(Collapse.Trigger, {
  display: 'flex',
  flexDirection: 'column',
  padding: '1.5rem 0',
  gap: '0.5rem',
  border: 'none',
  background: 'none',
  fontSize: 'inherit',
  lineHeight: 'inherit',
  fontWeight: 'inherit',
  textAlign: 'left',

  svg: {
    opacity: 0,
  },

  '&:hover svg': {
    opacity: 1,
  },
})

const StyledCollapse = styled(Collapse.Content, {
  display: 'grid',
  gridTemplateColumns: 'subgrid',
  gridColumn: '1 / -1',
  backgroundColor: 'var(--color-surface-secondary)',
  borderBottom: '1px solid var(--color-separator)',
})
