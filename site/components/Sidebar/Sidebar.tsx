import { GitProviderLink, Navigation } from 'mdxts/components'

import { allData } from 'data'
import styles from './Sidebar.module.css'

import { NavigationBoundary } from './NavigationBoundary'
import { NavigationToggle } from './NavigationToggle'
import { SidebarLink } from './SidebarLink'

export function Sidebar() {
  return (
    <aside className={styles.container}>
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
        <Navigation
          source={allData}
          renderList={renderList}
          renderItem={renderItem}
        />

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
              href="https://twitter.com/souporserious"
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
        <SidebarLink
          pathname={props.pathname}
          name={props.label}
          hasData={props.hasData}
        />
      )}
      {props.children}
    </li>
  )
}
