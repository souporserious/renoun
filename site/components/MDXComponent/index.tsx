'use client'
import * as React from 'react'
import type { MDXComponents } from 'mdx/types'
import { getComponent } from 'mdxts/utils'
import Editor from '@monaco-editor/react'

/** Renders a string of compiled MDX code as a client component. */
export function MDXComponent({ code }: { code: string }) {
  const Component = React.use(getComponent(code))
    .default as React.ComponentType<{
    components?: MDXComponents
  }>

  return (
    <Component
      components={{
        Example: ({
          source,
          identifier,
          code,
          transformedCode,
          language,
        }: {
          source: string
          identifier: string
          code: string
          transformedCode: string
          language: string
        }) => {
          const codeExports = React.use(getComponent(transformedCode))

          return (
            <>
              <pre>{code}</pre>
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
            </>
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
