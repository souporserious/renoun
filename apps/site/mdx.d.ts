declare module '*.mdx' {
  import type { ComponentType } from 'react'

  const MarkdownDocument: ComponentType<Record<string, unknown>>

  export default MarkdownDocument
  export const sections: import('renoun').ContentSection[]
}

declare module '*.md' {
  import type { ComponentType } from 'react'

  const MarkdownDocument: ComponentType<Record<string, unknown>>

  export default MarkdownDocument
  export const sections: import('renoun').ContentSection[]
}
