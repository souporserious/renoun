import {
  TableOfContents as BaseTableOfContents,
  type TableOfContentsProps,
  type TableOfContentsComponents,
} from 'renoun'
import type { FileSystemEntry } from 'renoun'
import type { CSSObject } from 'restyle'

import { ViewSource } from '@/components/ViewSource'

type SiteTableOfContentsProps = Omit<
  TableOfContentsProps,
  'children' | 'components'
> & {
  entry?: FileSystemEntry
}

export function TableOfContents({ headings, entry }: SiteTableOfContentsProps) {
  const components: Partial<TableOfContentsComponents> = {
    Root: ({ children, ...rest }) => (
      <nav
        {...rest}
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
      >
        {children}
      </nav>
    ),
    Title: ({ children, className, ...rest }) => (
      <h4 {...rest} className={[className, 'title'].filter(Boolean).join(' ')}>
        {children ?? 'On this page'}
      </h4>
    ),
    List: ({ children, ...rest }) => (
      <ol
        {...rest}
        css={{
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
    Link: ({ children, ...rest }) => {
      const styles: CSSObject = {
        fontSize: 'var(--font-size-body-3)',
        padding: '0.25rem 0',
        paddingLeft: 'calc(var(--level) * 0.8rem)',
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
      }

      return (
        <a {...rest} css={styles}>
          {children}
        </a>
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
