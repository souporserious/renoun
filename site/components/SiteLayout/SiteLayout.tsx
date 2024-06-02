import { GitProviderLink } from 'mdxts/components'
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
            style={{
              width: undefined,
              height: 'var(--font-size-body-1)',
              fill: 'white',
            }}
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
        <GitProviderLink
          css={{
            width: 'var(--font-size-body-1)',
            height: 'var(--font-size-body-1)',
            fill: 'var(--color-foreground-interactive)',
            marginLeft: '0.5rem',
            marginRight: '0.25rem',
          }}
        />
      </header>
      {sidebar}
      <main>{children}</main>
    </div>
  )
}
