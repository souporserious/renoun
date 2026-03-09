import React from 'react'
import { styled, type CSSObject } from 'restyle'

import type { TokenDiagnostic } from '../../utils/get-tokens.ts'
import type { ThemeColors } from '../../utils/get-theme.ts'
import { QuickInfoPopover } from './QuickInfoPopover.tsx'

export interface QuickInfoTheme {
  border?: string
  background: string
  foreground: string
  panelBorder: string
  errorForeground: string
}

export function createQuickInfoTheme(theme: ThemeColors): QuickInfoTheme {
  return {
    border: theme.editorHoverWidget.border,
    background: theme.editorHoverWidget.background,
    foreground: theme.editorHoverWidget.foreground,
    panelBorder: theme.panel.border,
    errorForeground: theme.editorError.foreground,
  }
}

export function QuickInfoContent({
  diagnostics,
  isLoading = false,
  loadingLabel = 'Loading symbol info...',
  loadingText,
  display,
  documentation,
  theme,
  css,
  className,
  style,
  testIds,
}: {
  diagnostics?: TokenDiagnostic[]
  isLoading?: boolean
  loadingLabel?: React.ReactNode
  loadingText?: React.ReactNode
  display?: React.ReactNode
  documentation?: React.ReactNode
  theme: QuickInfoTheme
  css?: CSSObject
  className?: string
  style?: React.CSSProperties
  testIds?: {
    container?: string
    content?: string
    divider?: string
  }
}) {
  return (
    <QuickInfoPopover>
      <Container
        data-testid={testIds?.container}
        css={{
          boxSizing: 'border-box',
          border: theme.border ? `1px solid ${theme.border}` : undefined,
          backgroundColor: theme.background,
          color: theme.foreground,
          ...css,
        }}
        className={className}
        style={style}
      >
        <ContentContainer data-testid={testIds?.content}>
          {diagnostics?.length ? (
            <DiagnosticContainer>
              {diagnostics.map((diagnostic, index) => (
                <Diagnostic key={index} style={{ color: theme.errorForeground }}>
                  {diagnostic.message}
                  <DiagnosticCode>({diagnostic.code})</DiagnosticCode>
                </Diagnostic>
              ))}
            </DiagnosticContainer>
          ) : null}

          {isLoading ? (
            <>
              {diagnostics?.length ? (
                <Divider color={theme.panelBorder} data-testid={testIds?.divider} />
              ) : null}
              <LoadingText>{loadingText ?? loadingLabel}</LoadingText>
            </>
          ) : null}

          {!isLoading && display ? (
            <>
              {diagnostics?.length ? (
                <Divider color={theme.panelBorder} data-testid={testIds?.divider} />
              ) : null}
              {display}
            </>
          ) : null}

          {!isLoading && documentation ? (
            <>
              <Divider color={theme.panelBorder} data-testid={testIds?.divider} />
              {documentation}
            </>
          ) : null}
        </ContentContainer>
      </Container>
    </QuickInfoPopover>
  )
}

export const QuickInfoDisplayText = styled('pre', {
  margin: 0,
  padding: '0.35rem 0.5rem',
  fontFamily: 'monospace',
  fontSize: '0.8rem',
  lineHeight: 1.35,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  overflowWrap: 'anywhere',
})

export const QuickInfoDisplayToken = styled('span')

export const QuickInfoMarkdown = styled('div', {
  padding: '0.35rem 0.5rem',
  fontSize: '0.825rem',
  lineHeight: 1.4,
  textWrap: 'pretty',
  '> *': {
    marginBottom: '0.25em',
  },
  '> *:last-child': {
    marginBottom: 0,
  },
})

export const QuickInfoDocumentationText = styled('div', {
  margin: 0,
  padding: '0.35rem 0.5rem',
  fontSize: '0.825rem',
  lineHeight: 1.4,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  overflowWrap: 'anywhere',
})

const Container = styled('div', {
  fontSize: '1rem',
  position: 'absolute',
  zIndex: 1000,
  maxWidth: 'min(46rem, calc(100vw - 2rem))',
  width: 'max-content',
  borderRadius: 5,
  boxShadow: '0 8px 30px rgba(0, 0, 0, 0.25)',
  overflow: 'auto',
  overscrollBehavior: 'contain',
})

const ContentContainer = styled('div', {
  display: 'grid',
  gap: 0,
  padding: 0,
})

const DiagnosticContainer = styled('div', {
  display: 'grid',
  gap: '0.25rem',
  padding: '0.35rem 0.5rem',
})

const Diagnostic = styled('p', {
  margin: 0,
  whiteSpace: 'pre-wrap',
  fontSize: '0.825rem',
  lineHeight: 1.35,
})

const DiagnosticCode = styled('span', {
  opacity: 0.7,
})

const Divider = styled('div', ({ color }: { color: string }) => ({
  height: 1,
  opacity: 0.65,
  backgroundColor: color,
}))

const LoadingText = styled('div', {
  margin: 0,
  padding: '0.35rem 0.5rem',
  fontSize: '0.8rem',
  lineHeight: 1.3,
  opacity: 0.85,
})
