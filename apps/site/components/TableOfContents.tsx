import {
  TableOfContents as BaseTableOfContents,
  type TableOfContentsProps,
  type TableOfContentsComponents,
} from 'renoun'
import type { FileSystemEntry } from 'renoun'

import { ViewSource } from '@/components/ViewSource'

type SiteTableOfContentsProps = Omit<
  TableOfContentsProps,
  'children' | 'components'
> & {
  entry?: FileSystemEntry
}

export function TableOfContents({ headings, entry }: SiteTableOfContentsProps) {
  const components: Partial<TableOfContentsComponents> = {
    Root: (props) => (
      <nav
        {...props}
        css={{
          gridColumn: 6,
          pointerEvents: 'auto',
          display: 'flex',
          flexDirection: 'column',
          height: 'var(--body-height)',
          padding: '4rem 1rem',
          marginTop: 'var(--header-height)',
          gap: '1rem',
          overflowY: 'auto',
          overscrollBehavior: 'contain',
        }}
      />
    ),
    Title: ({ children, id }) => (
      <h4 id={id} className="title">
        {children}
      </h4>
    ),
    List: ({ children, depth }) => (
      <ol
        css={{
          '--depth': depth,
          gridColumn: '1 / 2',
          gridRow: '1 / -1',
          listStyle: 'none',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          margin: 0,
        }}
      >
        {children}
      </ol>
    ),
    Link: (props) => {
      return (
        <a
          {...props}
          css={{
            display: 'block',
            fontSize: 'var(--font-size-body-3)',
            padding: '0.25rem 0',
            paddingLeft: 'calc(var(--depth) * 0.8rem)',
            scrollMarginBlock: 'var(--font-size-body-3)',
            whiteSpace: 'nowrap',
            textOverflow: 'ellipsis',
            overflow: 'hidden',
            color: 'var(--color-foreground-interactive)',
            ':hover': {
              color: 'var(--color-foreground-interactive-highlighted)',
            },
            '&[aria-current]': {
              color: 'white',
            },
          }}
        />
      )
    },
  }

  return (
    <aside
      css={{
        display: 'grid',
        position: 'fixed',
        inset: 0,
        gridTemplateColumns: 'var(--grid-template-columns)',
        '@media screen and (max-width: calc(60rem - 1px))': {
          display: 'none !important',
        },
        '@media screen and (min-width: 60rem)': {
          pointerEvents: 'none',
        },
      }}
    >
      <BaseTableOfContents headings={headings} components={components}>
        {entry ? (
          <ViewSource
            source={entry}
            css={{
              padding: '1rem 0',
              borderTop: '1px solid var(--color-separator)',
            }}
          />
        ) : null}
      </BaseTableOfContents>
    </aside>
  )
}
