import React, { Fragment } from 'react'
import { styled, type CSSObject } from 'restyle'

import { analyzeSourceText } from '../../project/index.js'
import { getThemeColors } from '../../utils/get-theme-colors.js'
import type { Token, TokenDiagnostic } from '../../utils/get-tokens.js'
import { MDXContent } from '../MDXContent.js'
import { QuickInfoPopover } from './QuickInfoPopover.js'

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
  const theme = await getThemeColors()
  let displayTextTokens: Token[][] = []

  if (quickInfo?.displayText) {
    const { tokens } = await analyzeSourceText({
      value: quickInfo.displayText,
      language: 'typescript',
    })
    displayTextTokens = tokens
  }

  return (
    <QuickInfoPopover>
      <Container
        css={{
          border: `1px solid ${theme.panel.border}`,
          backgroundColor: theme.panel.background,
          color: theme.foreground,
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
                      <TokenSpan key={index} css={{ color: token.color }}>
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
              <MDXContent
                components={{
                  p: ({ children }) => (
                    <Paragraph css={{ color: theme.foreground }}>
                      {children}
                    </Paragraph>
                  ),
                }}
                value={quickInfo.documentationText}
              />
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

const Paragraph = styled('p', {
  fontFamily: 'sans-serif',
  fontSize: 'inherit',
  lineHeight: 'inherit',
  padding: '0.25em 0.5em',
  margin: 0,
  textWrap: 'pretty',
})
