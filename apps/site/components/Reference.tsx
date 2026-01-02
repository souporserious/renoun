import {
  Reference as DefaultReference,
  type ReferenceProps,
  type ReferenceComponents,
  type ModuleExport,
} from 'renoun'
import { GeistMono } from 'geist/font/mono'
import type { CSSObject } from 'restyle'

import { Collapse } from './Collapse'
import { Markdown } from './Markdown'

export function References({
  fileExports,
}: {
  fileExports: ModuleExport<any>[]
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
        <Reference key={fileExport.name} source={fileExport} />
      ))}
    </div>
  )
}

export function Reference(props: ReferenceProps) {
  const components = {
    Section: ({ kind, ...props }) => (
      <Collapse.Provider>
        <section
          {...props}
          css={{
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
          }}
        />
      </Collapse.Provider>
    ),
    SectionHeading: ({ label, title, ...props }) => (
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
        <Collapse.Trigger
          css={{
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
            cursor: 'pointer',

            '&:hover': {
              svg: {
                opacity: 1,
              },
            },
            '&[aria-expanded="true"]': {
              svg: {
                opacity: 1,
              },
            },
          }}
        >
          <Collapse.TriggerIcon
            css={{
              width: 16,
              height: 16,
              position: 'absolute',
              top: '3.2rem',
              left: '-2rem',
              opacity: 0,
              color: 'var(--color-foreground-secondary)',
            }}
          />
          <span>{label}</span> {title}
        </Collapse.Trigger>
      </h3>
    ),
    SectionBody: ({ children }) => (
      <Collapse.Content>
        <div css={{ paddingBottom: '1.5rem' }}>{children}</div>
      </Collapse.Content>
    ),
    Column: ({ gap, ...props }) => (
      <div
        {...props}
        css={{
          display: 'flex',
          flexDirection: 'column',
          gap: gap ? gapSizes[gap] : undefined,
        }}
      />
    ),
    Row: ({ gap, ...props }) => (
      <div
        {...props}
        css={{
          display: 'flex',
          flexDirection: 'row',
          gap: gap ? gapSizes[gap] : undefined,
        }}
      />
    ),
    Detail: ({ kind, ...props }) => (
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
          fontSize: 'var(--font-size-body-1)',
          lineHeight: 'var(--line-height-body-1)',
          fontWeight: 'var(--font-weight-body)',
          color: 'var(--color-foreground-secondary)',
        }}
      />
    ),
    Signatures: (props) => (
      <div
        {...props}
        css={{
          display: 'flex',
          flexDirection: 'column',
          '& > *:not(:last-child)': {
            paddingBottom: '1.5rem',
            marginBottom: '1.5rem',
            borderBottom: '1px solid var(--color-separator-secondary)',
          },
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
    TableRowGroup: ({ hasSubRow, children }) => {
      return hasSubRow ? (
        <Collapse.Provider>{children}</Collapse.Provider>
      ) : (
        <>{children}</>
      )
    },
    TableRow: ({ hasSubRow, ...props }) => (
      <tr
        {...props}
        css={{
          borderTop: '1px solid var(--color-separator)',
        }}
      />
    ),
    TableSubRow: ({ children, colSpan }) => (
      <tr>
        <td colSpan={colSpan ?? 3} css={{ padding: 0 }}>
          <Collapse.Content>
            <div css={{ padding: '1rem 0' }}>{children}</div>
          </Collapse.Content>
        </td>
      </tr>
    ),
    TableHeader: (props) => (
      <th
        {...props}
        css={{
          textAlign: 'left',
          fontWeight: 'var(--font-weight-heading)',
          color: 'var(--color-foreground)',
        }}
      />
    ),
    TableData: ({ index, hasSubRow, ...props }) => {
      const isFirstWithSubRow = index === 0 && hasSubRow

      return (
        <td
          {...props}
          css={{
            whiteSpace: 'nowrap',
            width: '100%',
            position: 'relative',
            ...(isFirstWithSubRow ? {} : scrollStyles),

            ':not(:only-child):nth-child(1)': {
              maxWidth: '30.77%',
            },
            ':not(:only-child):nth-child(2)': {
              maxWidth: '38.46%',
            },
            ':not(:only-child):nth-child(3)': {
              maxWidth: '30.77%',
            },
          }}
        >
          {isFirstWithSubRow ? (
            <Collapse.Trigger
              css={{
                display: 'flex',
                alignItems: 'center',
                position: 'absolute',
                inset: '0 0 0 -2rem',
                cursor: 'pointer',

                '&:hover': {
                  svg: {
                    opacity: 1,
                  },
                },
                '&[aria-expanded="true"]': {
                  svg: {
                    opacity: 1,
                  },
                },
              }}
            >
              <Collapse.TriggerIcon
                css={{
                  width: 16,
                  height: 16,
                  opacity: 0,
                  color: 'var(--color-foreground-secondary)',
                }}
              />
            </Collapse.Trigger>
          ) : null}
          {props.children}
        </td>
      )
    },
    AccessorName: ({ name }) => (
      <span css={{ color: 'var(--color-foreground-secondary)' }}>{name}</span>
    ),
    Code: (props) => (
      <code
        {...props}
        css={{
          color: 'var(--color-foreground-interactive)',
          wordWrap: 'break-word',
        }}
        className={GeistMono.className}
      />
    ),
    Description: ({ children }) => (
      <div css={{ padding: '0.5rem 0' }}>
        <Markdown children={children} />
      </div>
    ),
    ...props.components,
  } satisfies Partial<ReferenceComponents>

  return (
    <>
      <DefaultReference {...props} components={components} />
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
    </>
  )
}

const gapSizes = {
  small: '0.5rem',
  medium: '1rem',
  large: '2rem',
}

const scrollStyles = {
  overflowX: 'auto',
  mask: 'linear-gradient(to right, #0000, #ffff var(--start-fade) calc(100% - var(--end-fade)), #0000)',
  animationName: 'scroll-mask',
  animationTimeline: '--scroll-mask',
  scrollTimeline: '--scroll-mask x',
} satisfies CSSObject
