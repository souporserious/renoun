import type { CSSObject } from 'restyle'
import type { CollectionSource, FileSystemSource } from 'renoun/collections'
import { GitProviderLink } from 'renoun/components'

import { DocsCollection } from 'collections'
import { NavigationBoundary } from './NavigationBoundary'
import { NavigationToggle } from './NavigationToggle'
import { SidebarLink } from './SidebarLink'

async function TreeNavigation({
  source,
  variant = 'title',
}: {
  source: FileSystemSource<any>
  variant?: 'name' | 'title'
}) {
  const sources = await source.getSources({ depth: 1 })
  const depth = source.getDepth()
  const path = source.getPath()
  const metadata = await source.getNamedExport('metadata').getValue()

  if (sources.length === 0) {
    return (
      <li>
        <SidebarLink
          pathname={path}
          label={
            variant === 'title'
              ? metadata?.title || source.getTitle()
              : source.getName()
          }
        />
      </li>
    )
  }

  const childrenSources = sources.map((childSource) => (
    <TreeNavigation
      key={childSource.getPath()}
      source={childSource}
      variant={variant}
    />
  ))

  const listStyles: CSSObject = {
    fontSize: 'var(--font-size-body-2)',
    display: 'flex',
    flexDirection: 'column',
    listStyle: 'none',
    paddingLeft: 0,
  }

  if (depth > 0) {
    if (depth === 1) {
      listStyles.paddingLeft = '0.8rem'
      listStyles.marginLeft = '0.05rem'
      listStyles.borderLeft = '1px solid var(--color-separator)'
    } else {
      listStyles.paddingLeft = depth * 0.4 + 'rem'
    }

    return (
      <li>
        <SidebarLink
          pathname={path}
          label={
            variant === 'title'
              ? metadata?.title || source.getTitle()
              : source.getName()
          }
        />
        <ul css={listStyles}>{childrenSources}</ul>
      </li>
    )
  }

  return <ul css={listStyles}>{childrenSources}</ul>
}

async function Navigation({
  collection,
  variant,
}: {
  collection: CollectionSource<any>
  variant?: 'name' | 'title'
}) {
  const sources = await collection.getSources({ depth: 1 })

  return (
    <ul
      css={{
        fontSize: 'var(--font-size-body-2)',
        display: 'flex',
        flexDirection: 'column',
        listStyle: 'none',
        paddingLeft: 0,
      }}
    >
      {sources.map((source) => (
        <TreeNavigation
          key={source.getPath()}
          source={source}
          variant={variant}
        />
      ))}
    </ul>
  )
}

export function Sidebar() {
  return (
    <aside
      css={{
        display: 'grid',
        gridAutoRows: 'min-content',
        alignItems: 'start',
        padding: '3rem 2rem',

        '@media screen and (min-width: 60rem)': {
          gridTemplateRows: '1fr min-content',
          height: 'fit-content',
          minHeight: '100dvh',
          padding: '2rem',
        },
      }}
    >
      <div
        css={{
          gridArea: '1 / 1',
          display: 'flex',
          justifyContent: 'space-between',
          gap: '2rem',
        }}
      >
        <NavigationToggle />
      </div>

      <NavigationBoundary>
        <Navigation collection={DocsCollection} />

        <div css={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div
            css={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.8rem',
            }}
          >
            <GitProviderLink
              css={{
                width: 'var(--font-size-body-2)',
                height: 'var(--font-size-body-2)',
                fill: 'var(--color-foreground-interactive)',
              }}
            />

            <a
              aria-label="X formerly known as Twitter"
              href="https://x.com/renoun_dev"
              rel="noopener"
              target="_blank"
              css={{ display: 'flex' }}
            >
              <svg
                viewBox="0 0 16 16"
                css={{
                  width: 'var(--font-size-body-2)',
                  height: 'var(--font-size-body-2)',
                  fill: 'var(--color-foreground-interactive)',
                }}
              >
                <path
                  fillRule="evenodd"
                  d="M0.5 0.5H5.75L9.48421 5.71053L14 0.5H16L10.3895 6.97368L16.5 15.5H11.25L7.51579 10.2895L3 15.5H1L6.61053 9.02632L0.5 0.5ZM12.0204 14L3.42043 2H4.97957L13.5796 14H12.0204Z"
                />
              </svg>
            </a>
          </div>

          <span
            css={{
              fontSize: 'var(--font-size-body-3)',
              color: 'var(--color-foreground-secondary)',
            }}
            suppressHydrationWarning={true}
          >
            © {new Date().getFullYear()}{' '}
            <a href="https://souporserious.com/" rel="noopener" target="_blank">
              souporserious
            </a>
          </span>
        </div>
      </NavigationBoundary>
    </aside>
  )
}
