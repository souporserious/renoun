'use client'

import * as React from 'react'
import * as jsxRuntime from 'react/jsx-runtime'
import { evaluateSync } from '@mdx-js/mdx'
import { Logo } from 'components/Logo'
import Link from 'next/link'

type ContentComponent = React.ComponentType<any>

const initialContent = `
# Hello MDX

## Start editing to see some magic happen!
`.trim()

export default function Editor() {
  const [value, setValue] = React.useState(initialContent)
  const [error, setError] = React.useState(null)
  const lastContent = React.useRef<ContentComponent>(null)
  const Content = React.useMemo(() => {
    try {
      const content = evaluateSync(value, jsxRuntime as any).default

      lastContent.current = content
      setError(null)

      return content
    } catch (error) {
      setError(error.toString())

      return lastContent.current
    }
  }, [value]) as ContentComponent

  return (
    <div>
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          padding: '4rem 2rem 2rem',
        }}
      >
        <Logo />
        <nav>
          <Link href="/getting-started">Docs</Link>
        </nav>
      </header>

      <main>
        <section
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr minmax(40ch, 1fr) minmax(40ch, 1fr) 1fr',
            gap: '2rem',
            padding: '2rem 8rem 8rem',
          }}
        >
          <h1 style={{ gridColumn: 2, fontSize: '4rem', lineHeight: 1 }}>
            Tell your story with the full power of MDX and TypeScript
          </h1>
          <p style={{ gridColumn: 3, fontSize: '2rem', paddingTop: '1rem' }}>
            Generate rich static content for any framework. MDXTS is a data
            generator for building performant sites with MDX and TypeScript.
          </p>
        </section>

        <section>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
              minHeight: '100vh',
            }}
          >
            <textarea
              value={value}
              onChange={(event) => setValue(event.target.value)}
              style={{
                padding: 16,
                background: 'black',
                color: 'white',
                outline: 'none',
              }}
            />
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                boxShadow: error && 'inset 0 0 0 2px #d54040',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  padding: 16,
                  gap: 16,
                  textAlign: 'center',
                  flex: 1,
                }}
              >
                <Content
                  components={{
                    h1: (props) => <h1 {...props} style={{ fontSize: 40 }} />,
                    h2: (props) => <h2 {...props} style={{ fontSize: 24 }} />,
                  }}
                />
              </div>
              {error && (
                <div
                  style={{
                    padding: 16,
                    backgroundColor: '#d54040',
                    color: 'white',
                  }}
                >
                  {error}
                </div>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
