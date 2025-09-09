import React, { Fragment } from 'react'
import { styled, type CSSObject } from 'restyle'

import { rehypePlugins, remarkPlugins } from '../../mdx/index.js'
import { getTokens } from '../../project/client.js'
import { getContext } from '../../utils/context.js'
import {
  getThemeColors,
  getThemeTokenVariables,
} from '../../utils/get-theme.js'
import type { Token, TokenDiagnostic } from '../../utils/get-tokens.js'
import { CodeInline } from '../CodeInline.js'
import { ServerConfigContext } from '../Config/ServerConfigContext.js'
import { Markdown, type MarkdownProps } from '../Markdown.js'
import { QuickInfoPopover } from './QuickInfoPopover.js'
import { CodeBlock, parsePreProps } from './CodeBlock.js'

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
    pre: (props) => {
      return <CodeBlock {...parsePreProps(props)} shouldAnalyze={false} />
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

/**
 * A quick info popover that displays diagnostics and documentation.
 * @internal
 */
export async function QuickInfo({
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
  const serverConfig = getContext(ServerConfigContext)
  const theme = await getThemeColors(serverConfig.theme)
  let displayTextTokens: Token[][] = []

  if (quickInfo?.displayText) {
    const tokens = await getTokens({
      value: quickInfo.displayText,
      language: 'typescript',
      languages: serverConfig.languages,
      theme: serverConfig.theme,
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
          ...getThemeTokenVariables(serverConfig.theme),
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
                      <TokenSpan key={index} css={token.style}>
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
