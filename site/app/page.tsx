import Link from 'next/link'
import { CopyButton } from 'mdxts/components/CopyButton'
import { Logo } from 'components/Logo'
import { HeroExample } from './HeroExample'
import { PageContainer } from './PageContainer'
import { SignupForm } from './SignupForm'

import styles from './page.module.css'

export default function Home() {
  return (
    <PageContainer className={styles.main}>
      <section className={styles.section}>
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
              Beta
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
          <ul className={styles.features}>
            <li>Author type-safe content</li>
            <li>Generate type documentation</li>
            <li>Preview source code</li>
            <li>And so much more</li>
          </ul>
        </div>
        <div className={styles.buttons}>
          <Link
            href="/docs/getting-started"
            style={{
              fontWeight: 500,
              position: 'relative',
              padding: '0.5rem 1rem',
              borderRadius: '0.25rem',
              border: '1px solid #3F687E',
              backgroundColor: '#080e1794',
              color: 'white',
              textDecoration: 'none',
            }}
          >
            Get Started
          </Link>
          <div className={styles.command}>
            <span
              style={{
                fontSize: 'var(--font-size-body-1)',
                color: '#B6D8ED',
                top: '0.1rem',
                userSelect: 'none',
              }}
            >
              $
            </span>
            <span style={{ fontWeight: 500 }}>npm create mdxts</span>
            <CopyButton
              value="npm create mdxts"
              style={{
                padding: 0,
                width: 'var(--font-size-body-1)',
                height: 'var(--font-size-body-1)',
              }}
            />
          </div>
        </div>
      </section>
      <div className={styles.maskContainer}>
        <HeroExample />
        <div className={styles.formSection}>
          <div className={styles.formContainer}>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '3rem',
                position: 'relative',
              }}
            >
              <h2
                style={{
                  fontSize: 'var(--font-size-heading-2-marketing)',
                  textAlign: 'center',
                }}
              >
                Stay Updated
              </h2>
              <SignupForm />
            </div>
            <ul className={styles.formList}>
              <li>Find out about new features first</li>
              <li>Stay updated on upcoming releases</li>
              <li>Quality content, unsubscribe anytime</li>
            </ul>
          </div>
        </div>
      </div>
    </PageContainer>
  )
}
