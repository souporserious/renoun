import type { CollectionSource, FileSystemSource } from 'renoun/collections'
import { GitProviderLink } from 'renoun/components'
import Link from 'next/link'

import { DocsCollection } from 'collections'
import { NavigationBoundary } from './NavigationBoundary'
import { NavigationToggle } from './NavigationToggle'
import { SidebarLink } from './SidebarLink'

async function TreeNavigation({ source }: { source: FileSystemSource<any> }) {
  const sources = await source.getSources({ depth: 1 })
  const depth = source.getDepth()
  const path = source.getPath()
  const metadata = await source.getNamedExport('metadata').getValue()

  if (sources.length === 0) {
    return (
      <li css={{ paddingLeft: `${depth}rem` }}>
        <Link
          href={path}
          style={{
            display: 'grid',
            color: 'white',
          }}
        >
          {metadata?.title || source.getTitle()}
        </Link>
      </li>
    )
  }

  const childrenSources = sources.map((childSource) => (
    <TreeNavigation key={childSource.getPath()} source={childSource} />
  ))

  if (depth > 0) {
    return (
      <li
        css={{
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          paddingLeft: `${depth}rem`,
        }}
      >
        <Link href={path} style={{ color: 'white' }}>
          {metadata?.title || source.getTitle()}
        </Link>
        <ul
          css={{
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
            listStyle: 'none',
            padding: 0,
            margin: 0,
          }}
        >
          {childrenSources}
        </ul>
      </li>
    )
  }

  return (
    <ul
      css={{
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
        listStyle: 'none',
        padding: 0,
        margin: 0,
      }}
    >
      {childrenSources}
    </ul>
  )
}

async function Navigation({
  collection,
}: {
  collection: CollectionSource<any>
}) {
  const sources = await collection.getSources({ depth: 1 })

  return (
    <ul
      css={{
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
        listStyle: 'none',
        padding: 0,
        margin: 0,
      }}
    >
      {sources.map((source) => (
        <TreeNavigation key={source.getPath()} source={source} />
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
        style={{
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

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div
            style={{
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
              href="https://x.com/mdxts_"
              rel="noopener"
              target="_blank"
              style={{ display: 'flex' }}
            >
              <svg
                viewBox="0 0 16 16"
                style={{
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
            style={{
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

function renderList(props: any) {
  const styles: React.CSSProperties = {
    fontSize: 'var(--font-size-body-2)',
    display: 'flex',
    flexDirection: 'column',
    listStyle: 'none',
    paddingLeft: 0,
  }

  if (props.depth === 0) {
    styles.gap = '1.5rem'
  } else if (props.depth === 1) {
    styles.paddingLeft = '0.8rem'
    styles.marginLeft = '0.05rem'
    styles.borderLeft = '1px solid var(--color-separator)'
  } else {
    styles.paddingLeft = props.depth * 0.4 + 'rem'
  }

  return <ul style={styles}>{props.children}</ul>
}

function renderItem(props: any) {
  return (
    <li key={props.label}>
      {props.depth === 0 ? (
        <div
          className="title"
          style={{ padding: '0.25rem 0px', marginBottom: '0.5rem' }}
        >
          {props.label}
        </div>
      ) : (
        <SidebarLink pathname={props.pathname} name={props.label} />
      )}
      {props.children}
    </li>
  )
}
