import { Logo } from 'components/Logo'
import Link from 'next/link'

import styles from './page.module.css'

export default function Home() {
  return (
    <div>
      <main>
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
                  }}
                >
                  Preview
                </span>
              </header>
              <h1
                style={{
                  gridColumn: 2,
                  lineHeight: 1,
                }}
              >
                Exceptional Content & Docs
              </h1>
              <p
                style={{
                  // @ts-expect-error - missing types
                  textWrap: 'balance',
                  fontSize: 'var(--font-size-heading-2)',
                  lineHeight: 1.3,
                  maxWidth: '24ch',
                  color: '#CDEDFF',
                }}
              >
                Build interactive, type-safe content and documentation in MDX,
                TypeScript, and React.
              </p>
            </div>
            <div
              style={{
                alignSelf: 'start',
                display: 'flex',
                alignItems: 'center',
                marginTop: '2rem',
                gap: '1rem',
              }}
            >
              <Link
                href="/docs/getting-started"
                style={{
                  padding: '0.5rem 1rem',
                  border: '1px solid #3F687E',
                  borderRadius: '0.25rem',
                  textDecoration: 'none',
                  color: 'white',
                }}
              >
                Get Started
              </Link>
              {/* <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0.5rem 1rem',
                  gap: '0.5rem',
                  backgroundColor: '#2A4655',
                  borderRadius: '0.25rem',
                  fontSize: 'var(--font-size-body-1)',
                  cursor: 'copy',
                }}
              >
                <span style={{ color: '#B6D8ED' }}>$</span>
                <span>npm create mdxts</span>
              </div> */}
            </div>
          </div>
          <div
            style={{
              display: 'grid',
              placeItems: 'center',
              aspectRatio: '16 / 12',
              width: '100%',
              border: '1px solid white',
            }}
          >
            Illustration Here
          </div>
        </section>
      </main>
    </div>
  )
}
