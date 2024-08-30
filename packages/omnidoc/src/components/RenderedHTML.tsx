import React from 'react'

import type { CodeBlockProps } from './CodeBlock'
import { CodeBlock } from './CodeBlock'

/** Renders `children` as HTML within a `CodeBlock` component. */
export async function RenderedHTML({
  children,
  includeHtml = true,
  ...props
}: {
  /** The React element(s) to render as HTML. */
  children: React.ReactNode

  /** Whether or not to wrap children in `html`, `head`, and `body` tags. */
  includeHtml?: boolean
} & Omit<CodeBlockProps, 'language' | 'value'>) {
  const { renderToStaticMarkup } = await import('react-dom/server')
  const content = includeHtml ? (
    <html>
      <head />
      <body>{children}</body>
    </html>
  ) : (
    children
  )
  const markup = renderToStaticMarkup(content)

  return <CodeBlock language="html" value={markup} {...props} />
}
