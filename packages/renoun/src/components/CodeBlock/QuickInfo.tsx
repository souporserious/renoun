import React, { Fragment } from 'react'
import { styled, type CSSObject } from 'restyle'
import { rehypePlugins } from '@renoun/mdx/rehype'
import { remarkPlugins } from '@renoun/mdx/remark'

import { getTokens } from '../../project/client.ts'
import { BASE_TOKEN_CLASS_NAME, getThemeColors } from '../../utils/get-theme.ts'
import type { Token, TokenDiagnostic } from '../../utils/get-tokens.ts'
import { CodeInline } from '../CodeInline.tsx'
import { getConfig } from '../Config/ServerConfigContext.tsx'
import { Markdown, type MarkdownProps } from '../Markdown.tsx'
import { QuickInfoPopover } from './QuickInfoPopover.tsx'
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
    code: (props) => {
      return (
        <CodeInline
          children={props.children as string}
          shouldAnalyze={false}
          css={{
            display: 'inline',
            fontSize: '0.9em',
            whiteSpace: 'pre-wrap',
            top: 2,
          }}
        />
      )
    },
    p: Paragraph,
    table: Table,
  },
  rehypePlugins,
  remarkPlugins,
} satisfies Omit<MarkdownProps, 'children'>

let queue: Promise<unknown> = Promise.resolve()

function enqueueQuickInfo<T>(task: () => Promise<T>) {
  const next = queue.then(
    () => task(),
    () => task()
  )
  queue = next.then(
    () => undefined,
    () => undefined
  )
  return next
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
  let displayTextTokens: Token[][] = []

  if (quickInfo?.displayText) {
    const tokens = await getTokens({
      value: quickInfo.displayText,
      language: 'typescript',
      languages: config.languages,
      theme: config.theme,
    })
    displayTextTokens = tokens
  }

  return (
    <QuickInfoPopover>
      <Container
        css={{
          boxSizing: 'border-box',
          border: theme.editorHoverWidget.border
            ? `1px solid ${theme.editorHoverWidget.border}`
            : undefined,
          backgroundColor: theme.editorHoverWidget.background,
          color: theme.editorHoverWidget.foreground,
          ...css,
        }}
        className={className}
        style={style}
      >
        <ContentContainer>
          {diagnostics ? (
            <DiagnosticContainer>
              {diagnostics.map((diagnostic, index) => (
                <Diagnostic key={index}>
                  {diagnostic.message}
                  <DiagnosticCode>({diagnostic.code})</DiagnosticCode>
                </Diagnostic>
              ))}
            </DiagnosticContainer>
          ) : null}

          {displayTextTokens.length ? (
            <>
              {diagnostics ? <Divider color={theme.panel.border} /> : null}
              <DisplayTextContainer>
                {displayTextTokens.map((line, index) => (
                  <Fragment key={index}>
                    {index === 0 ? null : '\n'}
                    {line.map((token, index) => (
                      <TokenSpan
                        key={index}
                        css={token.style}
                        className={BASE_TOKEN_CLASS_NAME}
                      >
                        {token.value}
                      </TokenSpan>
                    ))}
                  </Fragment>
                ))}
              </DisplayTextContainer>
            </>
          ) : null}

          {quickInfo?.documentationText.length ? (
            <>
              <Divider color={theme.panel.border} />
              <MarkdownContainer
                css={{
                  '--border': theme.panel.border,
                  color: theme.foreground,
                }}
              >
                <Markdown
                  children={quickInfo.documentationText}
                  {...mdxProps}
                />
              </MarkdownContainer>
            </>
          ) : null}
        </ContentContainer>
      </Container>
    </QuickInfoPopover>
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
    <QuickInfoPopover>
      <Container
        css={{
          boxSizing: 'border-box',
          border: '1px solid var(--renoun-editor-hover-widget-border, #3c3c3c)',
          backgroundColor:
            'var(--renoun-editor-hover-widget-background, rgba(37, 37, 38, 0.95))',
          color: 'var(--renoun-editor-hover-widget-foreground, #cccccc)',
          ...css,
        }}
        className={className}
        style={style}
      >
        <ContentContainer>
          <LoadingText>loading…</LoadingText>
        </ContentContainer>
      </Container>
    </QuickInfoPopover>
  )
}

const Container = styled('div', {
  fontSize: '1rem',
  position: 'absolute',
  zIndex: 1000,
  width: 'max-content',
  maxWidth: 540,
  borderRadius: 3,
  overflow: 'auto',
  overscrollBehavior: 'contain',
})

const ContentContainer = styled('div', {
  fontSize: '0.875em',
  lineHeight: '1.4em',
})

const MarkdownContainer = styled('div', {
  padding: '0.25em 0.5em 0',
  textWrap: 'pretty',
  '> *': {
    marginBottom: '0.25em',
  },
})

const DiagnosticContainer = styled('div', {
  padding: '0.25em 0.5em',
})

const Diagnostic = styled('div', {
  display: 'flex',
  gap: '0.5em',
})

const DiagnosticCode = styled('span', {
  opacity: 0.7,
})

const LoadingText = styled('div', {
  padding: '0.5em 0.75em',
  fontSize: '0.875em',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
})

const Divider = styled('hr', ({ color }: { color: string }) => ({
  height: 1,
  margin: 0,
  border: 'none',
  backgroundColor: color,
  opacity: 0.5,
}))

const DisplayTextContainer = styled('div', {
  fontFamily: 'monospace',
  whiteSpace: 'pre-wrap',
  padding: '0.25em 0.5em',
})

const TokenSpan = styled('span')
