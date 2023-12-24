import { Code } from 'mdxts/components'
import { Logo } from 'components/Logo'
import Link from 'next/link'

const counterSourceText = `
import { useState } from 'react'

export function useCounter(initialValue: number = 0) {
  const [count, setCount] = useState(initialValue)
  return {
    count,
    increment: () => setCount(count + 1),
    decrement: () => setCount(count - 1),
  }
}
`.trim()

export default function Home() {
  return (
    <div>
      <main>
        <section
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '2rem 8rem 8rem',
            gap: '2rem',
          }}
        >
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
                  marginBottom: '3rem',
                  gap: '1rem',
                }}
              >
                <Logo />
                <span
                  style={{
                    fontSize: '0.75rem',
                    padding: '0.25rem 0.5rem',
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
                  fontSize: '6vw',
                  lineHeight: 1,
                  // @ts-expect-error - missing types
                  textWrap: 'balance',
                }}
              >
                Exceptional Content & Docs
              </h1>
              <p
                style={{
                  // @ts-expect-error - missing types
                  textWrap: 'balance',
                  fontSize: '2.8vw',
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
                marginLeft: '-1rem',
                gap: '1rem',
              }}
            >
              <Link
                href="/getting-started"
                style={{
                  padding: '0.5rem 1rem',
                  border: '1px solid #3F687E',
                  borderRadius: '0.25rem',
                  textDecoration: 'none',
                }}
              >
                Get Started
              </Link>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0.5rem 1rem',
                  gap: '0.5rem',
                  backgroundColor: '#2A4655',
                  borderRadius: '0.25rem',
                  fontSize: 'var(--font-size-body)',
                  cursor: 'copy',
                }}
              >
                <span style={{ color: '#B6D8ED' }}>$</span>
                <span>npm create mdxts</span>
              </div>
            </div>
          </div>
          <div style={{ scale: 1.5 }}>
            <Code value={counterSourceText} language="tsx" />
          </div>
        </section>
      </main>
    </div>
  )
}
