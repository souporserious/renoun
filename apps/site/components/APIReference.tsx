import type { JavaScriptFileExport } from 'renoun/file-system'
import {
  APIReference as DefaultAPIReference,
  type APIReferenceProps,
  type APIReferenceComponents,
} from 'renoun/components'
import { GeistMono } from 'geist/font/mono'
import type { CSSObject } from 'restyle'

import { Collapse } from './Collapse'
import { Markdown } from './Markdown'

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
  const components = {
    Section: (props) => (
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
    SectionHeading: (props) => (
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
            }}
          />
          {props.children}
        </Collapse.Trigger>
      </h3>
    ),
    SectionBody: ({ children }) => (
      <Collapse.Content>{children}</Collapse.Content>
    ),
    Block: ({ gap, ...props }) => (
      <div
        {...props}
        css={{
          display: 'flex',
          flexDirection: 'column',
          gap: gap ? gapSizes[gap] : undefined,
        }}
      />
    ),
    Inline: ({ gap, ...props }) => (
      <div
        {...props}
        css={{
          display: 'flex',
          flexDirection: 'row',
          gap: gap ? gapSizes[gap] : undefined,
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
          position: 'absolute',
          width: '1px',
          height: '1px',
          padding: 0,
          margin: '-1px',
          overflow: 'hidden',
          clip: 'rect(0, 0, 0, 0)',
          whiteSpace: 'nowrap',
          border: 0,
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
    TableSubRow: ({ children }) => (
      <tr>
        <td colSpan={3} css={{ padding: 0 }}>
          <Collapse.Content
            css={{
              backgroundColor: 'var(--color-surface-secondary)',
              borderTop: '1px solid var(--color-separator)',
            }}
          >
            {children}
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

                svg: {
                  opacity: 0,
                },

                '&:hover': {
                  svg: {
                    opacity: 1,
                  },
                },
              }}
            >
              <Collapse.TriggerIcon css={{ width: 16, height: 16 }} />
            </Collapse.Trigger>
          ) : null}
          {props.children}
        </td>
      )
    },
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
  } satisfies Partial<APIReferenceComponents>

  return (
    <>
      <DefaultAPIReference {...props} components={components} />
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
