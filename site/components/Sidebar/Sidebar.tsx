import { Navigation } from 'mdxts/components'
import { allData } from 'data'
import { Logo } from 'components/Logo'
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
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '2rem',
        }}
      >
        <a href="/" style={{ display: 'flex' }}>
          <Logo />
        </a>
        <NavigationToggle />
        <a
          href="https://github.com/souporserious/mdxts/"
          style={{ display: 'flex' }}
        >
          <svg
            viewBox="0 0 16 16"
            fill="#fff"
            style={{
              width: 'var(--font-size-body-1)',
              height: 'var(--font-size-body-1)',
            }}
          >
            <path
              fillRule="evenodd"
              d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
            />
          </svg>
        </a>
      </div>

      <NavigationBoundary>
        <Navigation
          source={allData}
          renderList={renderList}
          renderItem={renderItem}
        />
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
