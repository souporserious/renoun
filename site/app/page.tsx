import Link from 'next/link'
import { CopyButton } from 'mdxts/components/CopyButton'
import { Logo } from 'components/Logo'
import { HeroExample } from './HeroExample'

import styles from './page.module.css'

export default function Home() {
  return (
    <main
      style={{
        display: 'grid',
        width: '100dvw',
        perspective: '5000px',
        overflow: 'hidden',
      }}
    >
      <section className={styles.section}>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <header
              style={{
                display: 'flex',
                alignItems: 'center',
                marginBottom: '3rem',
                gap: '1rem',
              }}
            >
              <Logo />
              <span
                style={{
                  fontSize: 'var(--font-size-body-2)',
                  padding: '0.25rem 0.8rem',
                  border: '1px solid #3F687E',
                  borderRadius: '1rem',
                  whiteSpace: 'nowrap',
                }}
              >
                Preview
              </span>
            </header>
            <h1
              style={{
                fontSize: 'var(--font-size-heading-1)',
                gridColumn: 2,
                lineHeight: 1,
                marginBottom: '1rem',
                position: 'relative',
                zIndex: 1,
              }}
            >
              The Content & Documentation SDK for React
            </h1>
            <ul
              style={{
                // @ts-expect-error - missing types
                textWrap: 'balance',
                fontSize: 'var(--font-size-heading-2)',
                lineHeight: 1.3,
                maxWidth: '24ch',
                paddingLeft: '1.5rem',
                color: 'var(--color-foreground-secondary)',
                position: 'relative',
                zIndex: 1,
              }}
            >
              <li>Write type-safe content</li>
              <li>Generate type documentation</li>
              <li>Preview source code</li>
              <li>And so much more</li>
            </ul>
          </div>
          <div className={styles.buttons}>
            <Link
              href="/docs/getting-started"
              style={{
                padding: '0.5rem 1rem',
                border: '1px solid #3F687E',
                borderRadius: '0.25rem',
                textDecoration: 'none',
                color: 'white',
                position: 'relative',
                zIndex: 1,
              }}
            >
              Get Started
            </Link>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.5rem 1rem',
                gap: '0.5rem',
                backgroundColor: '#2A4655',
                borderRadius: '0.25rem',
                fontSize: 'var(--font-size-body-1)',
                position: 'relative',
                zIndex: 1,
              }}
            >
              <span
                style={{ fontSize: '1rem', color: '#B6D8ED', top: '0.1rem' }}
              >
                $
              </span>
              <span>npm create mdxts</span>
              <CopyButton value="npm create mdxts" />
            </div>
          </div>
        </div>
      </section>
      <div className={styles.heroExample}>
        <HeroExample />
      </div>
    </main>
  )
}
