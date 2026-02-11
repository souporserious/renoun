import React from 'react'
import { describe, it, expect } from 'vitest'
import { PassThrough } from 'node:stream'
import { renderToPipeableStream } from 'react-dom/server'

import { MDX } from '../MDX.tsx'
import { CodeBlock } from './CodeBlock.tsx'

async function renderToStringAsync(
  element: React.ReactElement,
  timeoutMs = 30_000
) {
  return new Promise<string>((resolve, reject) => {
    const stream = new PassThrough()
    const chunks: Buffer[] = []
    let settled = false
    const finish = (error?: unknown) => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timeout)
      if (error) {
        reject(error)
      } else {
        resolve(Buffer.concat(chunks).toString('utf8'))
      }
    }

    stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
    stream.on('error', (error) => finish(error))
    stream.on('end', () => finish())

    const { pipe, abort } = renderToPipeableStream(element, {
      onAllReady() {
        pipe(stream)
      },
      onShellError(error) {
        finish(error)
      },
      onError(error) {
        finish(error)
      },
    })

    const timeout = setTimeout(() => {
      try {
        abort()
      } catch {
        // ignore
      }
      finish(new Error(`renderToStringAsync timed out after ${timeoutMs}ms`))
    }, timeoutMs)
  })
}

const codeString = `
\`\`\`tsx path="CodeBlock.example.tsx" allowCopy={false} showErrors
import { CodeBlock } from 'renoun'

const code = \`
'use client'
import React, { useState } from 'react'

export function useCounter(initialValue: number = 0) {
  const [count, setCount] = useState(initialValue)

  return { count, increment: () => setCount(count + 1), decrement: () => setCount(count - 1) }
}
\`

export default function Page() {
  return (
    <CodeBlock path="useCounter.ts" shouldFormat>
      {code}
    </CodeBlock>
  )
}
\`\`\`
`

const mdxString = `
# Hello World

<Step>

${codeString}

</Step>
`

describe('MDX CodeBlock SSR', () => {
  it('renders the CodeBlock component', async () => {
    const element = (
      <MDX
        components={{
          CodeBlock,
          Step: ({ children }) => <div>{children}</div>,
        }}
      >
        {mdxString}
      </MDX>
    )
    const html = await renderToStringAsync(element)
    expect(html).toContain('CodeBlock.example.tsx')
    expect(html).toMatch(/UMD global|react\/jsx-runtime/)
    expect(html).not.toContain('Copy code to clipboard')
  }, 60_000)
})
