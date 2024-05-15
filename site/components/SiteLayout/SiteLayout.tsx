import { MdxtsLogo } from 'mdxts/assets'

import { NavigationLink } from './NavigationLink'
import styles from './SiteLayout.module.css'

export function SiteLayout({
  sidebar,
  children,
}: {
  sidebar?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className={styles.container}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'end',
          padding: '4rem 2rem 2rem',
          gap: '0.25rem',
        }}
      >
        <a
          href="/"
          style={{
            display: 'flex',
            marginRight: 'auto',
          }}
        >
          <MdxtsLogo
            style={{ width: undefined, height: 'var(--font-size-body-1)' }}
          />
        </a>
        <NavigationLink
          href="/docs/getting-started"
          activePathnames={['/docs', '/packages']}
        >
          Docs
        </NavigationLink>
        <NavigationLink href="/blog">Blog</NavigationLink>
        <NavigationLink href="/changelog">Changelog</NavigationLink>
      </header>
      {sidebar}
      <main>{children}</main>
    </div>
  )
}
