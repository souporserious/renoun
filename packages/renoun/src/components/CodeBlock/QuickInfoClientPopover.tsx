'use client'
import React, { Fragment } from 'react'
import { styled, type CSSObject } from 'restyle'

import type { TokenDiagnostic } from '../../utils/get-tokens.ts'
import { QuickInfoPopover } from './QuickInfoPopover.tsx'
import { useQuickInfoContext } from './QuickInfoProvider.tsx'
import {
  clearQuickInfoClientPopoverCaches,
  getQuickInfoForRequest,
  type QuickInfoData,
  type QuickInfoRequest,
  type QuickInfoTokenizedDisplayText,
  resolveQuickInfoProjectVersion,
  resolveQuickInfoRuntimeSelection,
  useResolvedQuickInfoClientState,
} from './QuickInfoClientState.tsx'

interface QuickInfoTheme {
  border?: string
  background: string
  foreground: string
  panelBorder: string
  errorForeground: string
}

const QUICK_INFO_KEYWORDS = new Set([
  'abstract',
  'as',
  'async',
  'await',
  'class',
  'const',
  'constructor',
  'declare',
  'default',
  'enum',
  'export',
  'extends',
  'false',
  'from',
  'function',
  'get',
  'implements',
  'import',
  'in',
  'infer',
  'interface',
  'is',
  'keyof',
  'let',
  'module',
  'namespace',
  'new',
  'null',
  'private',
  'protected',
  'public',
  'readonly',
  'return',
  'set',
  'static',
  'this',
  'true',
  'type',
  'typeof',
  'undefined',
  'var',
  'void',
])

const QUICK_INFO_TOKEN_PATTERN =
  /('(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`|[A-Za-z_$][A-Za-z0-9_$]*|\d+(?:\.\d+)?|[\r\n]+|[ \t]+|[^\sA-Za-z0-9_$]+)/g
const QUICK_INFO_TEST_IDS_ENABLED = process.env.NODE_ENV === 'test'

function getQuickInfoTestId(
  id: 'content' | 'divider' | 'display'
): string | undefined {
  if (!QUICK_INFO_TEST_IDS_ENABLED) {
    return undefined
  }

  if (id === 'content') {
    return 'quick-info-content'
  }

  if (id === 'display') {
    return 'quick-info-display'
  }

  return 'quick-info-divider'
}

export function QuickInfoClientPopover({
  diagnostics,
  quickInfo,
  request,
  theme,
  css,
  className,
  style,
}: {
  diagnostics?: TokenDiagnostic[]
  quickInfo?: QuickInfoData
  request?: QuickInfoRequest
  theme: QuickInfoTheme
  css?: CSSObject
  className?: string
  style?: React.CSSProperties
}) {
  const { quickInfo: activeQuickInfo } = useQuickInfoContext()
  const {
    isLoading,
    resolvedQuickInfo,
    resolvedDisplayTokens,
    resolvedDocumentationContent,
  } = useResolvedQuickInfoClientState({
    anchorId: activeQuickInfo?.anchorId,
    quickInfo,
    request,
  })
  const displayText = resolvedQuickInfo?.displayText || ''
  const documentationText = resolvedQuickInfo?.documentationText || ''

  return (
    <QuickInfoPopover>
      <Container
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
        <ContentContainer data-testid={getQuickInfoTestId('content')}>
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
                <Divider
                  color={theme.panelBorder}
                  data-testid={getQuickInfoTestId('divider')}
                />
              ) : null}
              <LoadingText>Loading symbol info...</LoadingText>
            </>
          ) : null}

          {!isLoading && displayText ? (
            <>
              {diagnostics?.length ? (
                <Divider
                  color={theme.panelBorder}
                  data-testid={getQuickInfoTestId('divider')}
                />
              ) : null}
              <DisplayTextContainer data-testid={getQuickInfoTestId('display')}>
                {resolvedDisplayTokens
                  ? renderTokenizedDisplayText(resolvedDisplayTokens)
                  : renderHighlightedDisplayText(displayText)}
              </DisplayTextContainer>
            </>
          ) : null}

          {!isLoading &&
          documentationText.length &&
          resolvedDocumentationContent !== null ? (
            <>
              <Divider
                color={theme.panelBorder}
                data-testid={getQuickInfoTestId('divider')}
              />
              {typeof resolvedDocumentationContent === 'string' ? (
                <DocumentationText>{resolvedDocumentationContent}</DocumentationText>
              ) : (
                <MarkdownContainer>{resolvedDocumentationContent}</MarkdownContainer>
              )}
            </>
          ) : null}
        </ContentContainer>
      </Container>
    </QuickInfoPopover>
  )
}

function renderTokenizedDisplayText(
  lines: QuickInfoTokenizedDisplayText
): React.ReactNode {
  return lines.map((line, lineIndex) => {
    return (
      <Fragment key={lineIndex}>
        {lineIndex === 0 ? null : '\n'}
        {line.map((token, tokenIndex) => {
          return (
            <DisplayToken key={tokenIndex} style={resolveDisplayTokenStyle(token.style)}>
              {token.value}
            </DisplayToken>
          )
        })}
      </Fragment>
    )
  })
}

function resolveDisplayTokenStyle(
  style: Record<string, string>
): React.CSSProperties {
  const resolvedStyle: React.CSSProperties = {}
  const color = resolveDisplayTokenStyleValue(style, 'fg', 'color')
  if (color) {
    resolvedStyle.color = color
  }

  const fontStyle = resolveDisplayTokenStyleValue(style, 'fs', 'fontStyle')
  if (fontStyle) {
    resolvedStyle.fontStyle = fontStyle
  }

  const fontWeight = resolveDisplayTokenStyleValue(style, 'fw', 'fontWeight')
  if (fontWeight) {
    resolvedStyle.fontWeight = fontWeight
  }

  const textDecoration = resolveDisplayTokenStyleValue(
    style,
    'td',
    'textDecoration'
  )
  if (textDecoration) {
    resolvedStyle.textDecoration = textDecoration
  }

  return resolvedStyle
}

function resolveDisplayTokenStyleValue(
  style: Record<string, string>,
  styleSuffix: 'fg' | 'fs' | 'fw' | 'td',
  directProperty: 'color' | 'fontStyle' | 'fontWeight' | 'textDecoration'
): string | undefined {
  const directValue = style[directProperty]
  if (typeof directValue === 'string' && directValue.length > 0) {
    return directValue
  }

  for (const [key, value] of Object.entries(style)) {
    if (
      key.startsWith('--') &&
      key.endsWith(styleSuffix) &&
      typeof value === 'string' &&
      value.length > 0
    ) {
      return value
    }
  }

  return undefined
}

function renderHighlightedDisplayText(displayText: string): React.ReactNode {
  const parts = displayText.match(QUICK_INFO_TOKEN_PATTERN) ?? [displayText]

  return parts.map((part, index) => {
    if (part === '\n' || part === '\r\n' || part === '\r') {
      return <Fragment key={index}>{part}</Fragment>
    }

    if (/^['"`]/.test(part)) {
      return <StringToken key={index}>{part}</StringToken>
    }

    if (QUICK_INFO_KEYWORDS.has(part)) {
      return <KeywordToken key={index}>{part}</KeywordToken>
    }

    if (/^[A-Z][A-Za-z0-9_$]*$/.test(part)) {
      return <TypeToken key={index}>{part}</TypeToken>
    }

    return <Fragment key={index}>{part}</Fragment>
  })
}

export { clearQuickInfoClientPopoverCaches }

export const __TEST_ONLY__ = {
  clearQuickInfoClientPopoverCaches,
  getQuickInfoForRequest,
  resolveQuickInfoProjectVersion,
  resolveQuickInfoRuntimeSelection,
}

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

const DisplayTextContainer = styled('pre', {
  margin: 0,
  padding: '0.35rem 0.5rem',
  fontFamily: 'monospace',
  fontSize: '0.8rem',
  lineHeight: 1.35,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  overflowWrap: 'anywhere',
})

const DisplayToken = styled('span')

const MarkdownContainer = styled('div', {
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

const DocumentationText = styled('div', {
  margin: 0,
  padding: '0.35rem 0.5rem',
  fontSize: '0.825rem',
  lineHeight: 1.4,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  overflowWrap: 'anywhere',
})

const KeywordToken = styled('span', {
  color: 'var(--renoun-quick-info-keyword, #82aaff)',
  fontStyle: 'italic',
})

const TypeToken = styled('span', {
  color: 'var(--renoun-quick-info-type, #86e1fc)',
})

const StringToken = styled('span', {
  color: 'var(--renoun-quick-info-string, #ecc48d)',
})
