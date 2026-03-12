import React, { Fragment } from 'react'
import { styled, type CSSObject } from 'restyle'
import { rehypePlugins } from '@renoun/mdx/rehype'
import { remarkPlugins } from '@renoun/mdx/remark'

import { getTokens } from '../../analysis/node-client.ts'
import { BASE_TOKEN_CLASS_NAME, getThemeColors } from '../../utils/get-theme.ts'
import { createConcurrentQueue } from '../../utils/concurrency.ts'
import type { Token, TokenDiagnostic } from '../../utils/get-tokens.ts'
import { getConfig } from '../Config/ServerConfigContext.tsx'
import { Markdown, type MarkdownProps } from '../Markdown.tsx'
import {
  createQuickInfoTheme,
  QuickInfoContent,
  QuickInfoDisplayText,
  QuickInfoDisplayToken,
  QuickInfoMarkdown,
} from './QuickInfoContent.tsx'
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

const mdxProps = {
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

const quickInfoQueue = createConcurrentQueue(1)

function enqueueQuickInfo<T>(task: () => Promise<T>) {
  return quickInfoQueue.run(task)
}

async function renderQuickInfo({
  diagnostics,
  quickInfo,
  css,
  className,
  style,
}: {
  diagnostics?: TokenDiagnostic[]
  quickInfo?: { displayText: string; documentationText: string }
  css?: CSSObject
  className?: string
  style?: React.CSSProperties
}) {
  const config = await getConfig()
  const theme = await getThemeColors(config.theme)
  const quickInfoTheme = createQuickInfoTheme(theme)
  let displayTextTokens: Token[][] = []

  if (quickInfo?.displayText) {
    const tokens = await getTokens({
      value: quickInfo.displayText,
      language: 'typescript',
      languages: config.languages,
      theme: config.theme,
      waitForWarmResult: true,
    })
    displayTextTokens = tokens
  }

  return (
    <QuickInfoContent
      diagnostics={diagnostics}
      display={
        displayTextTokens.length ? (
          <QuickInfoDisplayText>
            {displayTextTokens.map((line, index) => (
              <Fragment key={index}>
                {index === 0 ? null : '\n'}
                {line.map((token, tokenIndex) => (
                  <QuickInfoDisplayToken
                    key={tokenIndex}
                    css={token.style}
                    className={BASE_TOKEN_CLASS_NAME}
                  >
                    {token.value}
                  </QuickInfoDisplayToken>
                ))}
              </Fragment>
            ))}
          </QuickInfoDisplayText>
        ) : null
      }
      documentation={
        quickInfo?.documentationText.length ? (
          <QuickInfoMarkdown
            css={{
              '--border': quickInfoTheme.panelBorder,
              color: quickInfoTheme.foreground,
            }}
          >
            <Markdown children={quickInfo.documentationText} {...mdxProps} />
          </QuickInfoMarkdown>
        ) : null
      }
      theme={quickInfoTheme}
      css={css}
      className={className}
      style={style}
    />
  )
}

/**
 * A quick info popover that displays diagnostics and documentation.
 * @internal
 */
export async function QuickInfo(props: {
  diagnostics?: TokenDiagnostic[]
  quickInfo?: { displayText: string; documentationText: string }
  css?: CSSObject
  className?: string
  style?: React.CSSProperties
}) {
  return enqueueQuickInfo(() => renderQuickInfo(props))
}

export function QuickInfoLoading({
  css,
  className,
  style,
}: {
  css?: CSSObject
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <QuickInfoContent
      isLoading
      loadingText="loading…"
      theme={{
        border: 'var(--renoun-editor-hover-widget-border, #3c3c3c)',
        background:
          'var(--renoun-editor-hover-widget-background, rgba(37, 37, 38, 0.95))',
        foreground: 'var(--renoun-editor-hover-widget-foreground, #cccccc)',
        panelBorder: 'var(--renoun-panel-border, currentColor)',
        errorForeground: 'var(--renoun-editor-error-foreground, #f14c4c)',
      }}
      css={css}
      className={className}
      style={style}
    />
  )
}
