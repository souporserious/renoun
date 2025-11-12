import React from 'react'
import { describe, it, expect } from 'vitest'
import { PassThrough } from 'node:stream'
import { renderToPipeableStream } from 'react-dom/server'

import { MDX } from '../MDX.js'
import { CodeBlock } from './CodeBlock.js'

async function renderToStringAsync(element: React.ReactElement) {
  return new Promise<string>((resolve, reject) => {
    const stream = new PassThrough()
    const chunks: Buffer[] = []
    stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
    stream.on('error', reject)
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))

    const { pipe } = renderToPipeableStream(element, {
      onAllReady() {
        pipe(stream)
      },
      onError(error) {
        reject(error)
      },
    })
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
    expect(html).toContain('UMD global')
    expect(html).not.toContain('Copy code to clipboard')
  })
})
