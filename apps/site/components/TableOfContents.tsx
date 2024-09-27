'use client'
import type { CSSObject } from 'restyle'
import type { Headings } from '@renoun/mdx'

import { useSectionObserver } from 'hooks/use-section-observer'
import { ViewSource } from './ViewSource'

export function TableOfContents({
  headings,
  editPath,
}: {
  headings: Headings
  editPath?: string
}) {
  const sectionObserver = useSectionObserver()

  return (
    <aside
      css={{
        display: 'grid',
        pointerEvents: 'none',
        position: 'fixed',
        inset: 0,
        gridTemplateColumns: 'var(--grid-template-columns)',

        '@media screen and (max-width: calc(60rem - 1px))': {
          display: 'none !important',
        },
      }}
    >
      <nav
        css={{
          pointerEvents: 'auto',
          gridColumn: '6 / -1',
          height: 'var(--body-height)',
          padding: '4rem 0',
          marginTop: 'var(--header-height)',
          overflowY: 'auto',
          overscrollBehavior: 'contain',
        }}
      >
        <ul
          css={{
            listStyle: 'none',
            display: 'flex',
            flexDirection: 'column',
            padding: '0 1rem',
            margin: 0,
          }}
        >
          <li css={{ marginBottom: '1rem' }}>
            <h4 className="title">On this page</h4>
          </li>
          {headings?.map(({ text, depth, id }, index) =>
            depth > 1 ? (
              <li key={id} css={{ display: 'flex' }}>
                <Link
                  id={id}
                  sectionObserver={sectionObserver}
                  css={{ paddingLeft: (depth - 2) * 0.8 + 'rem' }}
                  title={text}
                >
                  {text}
                </Link>
              </li>
            ) : null
          )}
          {editPath ? (
            <>
              <li css={{ margin: '0.8rem 0' }}>
                <hr
                  css={{
                    border: 'none',
                    height: 1,
                    backgroundColor: 'var(--color-separator)',
                  }}
                />
              </li>
              <li>
                <ViewSource href={editPath} />
              </li>
            </>
          ) : null}
        </ul>
      </nav>
    </aside>
  )
}

function Link({
  id,
  title,
  children,
  sectionObserver,
  css,
}: {
  id: string
  title: string
  children: React.ReactNode
  sectionObserver: ReturnType<typeof useSectionObserver>
  css: CSSObject
}) {
  const [isActive, linkProps] = sectionObserver.useLink(id)
  const styles: CSSObject = {
    fontSize: 'var(--font-size-body-3)',
    padding: '0.25rem 0',
    scrollMarginBlock: 'var(--font-size-body-3)',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
    overflow: 'hidden',
    color: 'var(--color-foreground-interactive)',
    ':hover': {
      color: 'var(--color-foreground-interactive-highlighted)',
    },
    '&.active': {
      color: 'white',
    },
  }

  return (
    <a
      title={title}
      css={{ ...styles, ...css }}
      className={isActive ? 'active' : ''}
      suppressHydrationWarning
      {...linkProps}
    >
      {children}
      <script
        dangerouslySetInnerHTML={{
          __html: `window.isSectionLinkActive('${id}')`,
        }}
      />
    </a>
  )
}
