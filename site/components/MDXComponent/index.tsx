'use client'
import * as React from 'react'
import * as jsxui from '@jsxui/react'
import type { MDXComponents } from 'mdx/types'
import { getComponent } from 'mdxts/utils'
import Editor from '@monaco-editor/react'

const dependencies = {
  '@jsxui/react': jsxui,
}

/** Renders a string of compiled MDX code as a client component. */
export function MDXComponent({ code }: { code: string }) {
  const Component = React.use(getComponent(code, dependencies))
    .default as React.ComponentType<{
    components?: MDXComponents
  }>

  return (
    <Component
      components={{
        Example: ({
          source,
          identifier,
          language,
          code,
          transformedCode,
        }: {
          source: string
          identifier: string
          code: string
          transformedCode: string
          language: string
        }) => {
          const codeExports = React.use(
            getComponent(transformedCode, dependencies)
          )

          if (identifier) {
            const Component = codeExports[identifier]

            return (
              <>
                <pre>{code}</pre>
                <Component />
              </>
            )
          }

          return (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
              }}
            >
              <pre>{code}</pre>
              <div style={{ padding: '1rem' }}>
                {Object.entries(codeExports)
                  .filter(([, value]) => Boolean(value))
                  .map(([key, Component]) => {
                    return (
                      <div key={key}>
                        <h2>{key}</h2>
                        <Component />
                      </div>
                    )
                  })}
              </div>
            </div>
          )
        },
        Preview: ({
          source,
          identifier,
        }: {
          source: string
          identifier: string
        }) => {
          return <>Preview Here</>
        },
        Summary: (props) => {
          return <div {...props} style={{ fontSize: '1.2rem' }} />
        },
        pre: ({ code, live, ...props }: any) => {
          if (live) {
            return (
              <Editor
                value={code}
                language="typescript"
                theme="vs-dark"
                height="20rem"
                options={{
                  minimap: { enabled: false },
                  fontSize: 14,
                  scrollBeyondLastLine: false,
                  lineNumbers: 'off',
                  lineDecorationsWidth: 0,
                  lineNumbersMinChars: 0,
                  glyphMargin: false,
                  folding: false,
                }}
              />
            )
          }

          return <pre {...props} />
        },
      }}
    />
  )
}
