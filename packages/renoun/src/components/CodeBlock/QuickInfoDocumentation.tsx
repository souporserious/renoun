import React from 'react'
import { styled } from 'restyle'
import { rehypePlugins } from '@renoun/mdx/rehype'
import { remarkPlugins } from '@renoun/mdx/remark'

import { Markdown, type MarkdownProps } from '../Markdown.tsx'
import { QuickInfoMarkdown, type QuickInfoTheme } from './QuickInfoContent.tsx'
import { CodeBlock } from './CodeBlock.tsx'

const Paragraph = styled('p', {
  fontFamily: 'sans-serif',
  fontSize: 'inherit',
  lineHeight: 'inherit',
  margin: 0,
  textWrap: 'pretty',
})

const Table = styled('table', {
  borderCollapse: 'collapse',
  'th, td': {
    padding: '0.25em 0.75em',
    border: '1px solid var(--border)',
  },
})

export const quickInfoMarkdownProps = {
  components: {
    CodeBlock: (props) => {
      return <CodeBlock {...props} shouldAnalyze={false} />
    },
    p: Paragraph,
    table: Table,
  },
  rehypePlugins,
  remarkPlugins,
} satisfies Omit<MarkdownProps, 'children'>

export function QuickInfoDocumentation({
  documentationText,
  theme,
}: {
  documentationText: string
  theme: QuickInfoTheme
}) {
  if (documentationText.length === 0) {
    return null
  }

  return (
    <QuickInfoMarkdown
      css={{
        '--border': theme.panelBorder,
        color: theme.foreground,
      }}
    >
      <Markdown children={documentationText} {...quickInfoMarkdownProps} />
    </QuickInfoMarkdown>
  )
}
