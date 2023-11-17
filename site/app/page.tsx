'use client'

import * as React from 'react'
import * as jsxRuntime from 'react/jsx-runtime'
import { evaluateSync } from '@mdx-js/mdx'
// import { Editor } from 'mdxts/components/client'
import { Logo } from 'components/Logo'
import Link from 'next/link'
// import theme from '../theme.json'

type ContentComponent = React.ComponentType<any>

const initialContent = `
# Hello MDX

## Start editing to see some magic happen!

\`\`\`tsx
import { createMdxtsPlugin } from 'mdxts/next'

const withMdxts = createMdxtsPlugin({
  theme: 'theme.json',
  gitSource: 'souporserious/mdxts',
})

export default withMdxts({
  // Next.js config options...
})
\`\`\`
`.trim()

export default function Home() {
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
        <section style={{ padding: '2rem 8rem 8rem' }}>
          <h1
            style={{
              gridColumn: 2,
              fontSize: '6vw',
              lineHeight: 1,
              textAlign: 'center',
            }}
          >
            Structured content authoring in MDX.
          </h1>
        </section>

        <section>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
            }}
          >
            {/* <Editor
              value={value}
              onChange={(event) => setValue(event.target.value)}
              theme={theme as any}
              language="mdx"
            /> */}
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
              <div style={{ padding: 16, flex: 1 }}>
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
