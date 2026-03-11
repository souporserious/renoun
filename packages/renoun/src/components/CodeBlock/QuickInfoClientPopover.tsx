'use client'
import React, { Fragment } from 'react'
import { styled, type CSSObject } from 'restyle'

import type { TokenDiagnostic } from '../../utils/get-tokens.ts'
import {
  QuickInfoContent,
  QuickInfoDisplayText,
  QuickInfoDisplayToken,
  QuickInfoDocumentationText,
  type QuickInfoTheme,
} from './QuickInfoContent.tsx'
import { useQuickInfoContext } from './QuickInfoProvider.tsx'
import {
  type QuickInfoData,
  type QuickInfoRequest,
  type QuickInfoTokenizedDisplayText,
  useResolvedQuickInfoClientState,
} from './QuickInfoClientState.tsx'

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
const QUICK_INFO_DOCUMENTATION_TOKEN_PATTERN =
  /(\[[^\]]+\]\([^)]+\)|`[^`]+`)/g
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
  const activeThemeName = useActiveThemeName(activeQuickInfo?.anchorId)
  const tokenThemeConfig = React.useMemo(() => {
    return resolveQuickInfoTokenThemeConfig(request?.themeConfig, activeThemeName)
  }, [activeThemeName, request?.themeConfig])
  const {
    isLoading,
    resolvedQuickInfo,
    resolvedDisplayTokens,
  } = useResolvedQuickInfoClientState({
    quickInfo,
    request,
    tokenThemeConfig,
  })
  const displayText = resolvedQuickInfo?.displayText || ''
  const documentationText = resolvedQuickInfo?.documentationText || ''
  const documentationContent = React.useMemo(() => {
    return renderQuickInfoDocumentationContent(documentationText)
  }, [documentationText])

  return (
    <QuickInfoContent
      diagnostics={diagnostics}
      isLoading={isLoading}
      display={
        !isLoading && displayText ? (
          <QuickInfoDisplayText data-testid={getQuickInfoTestId('display')}>
            {resolvedDisplayTokens
              ? renderTokenizedDisplayText(resolvedDisplayTokens)
              : renderHighlightedDisplayText(displayText)}
          </QuickInfoDisplayText>
        ) : undefined
      }
      documentation={
        !isLoading && documentationContent ? (
          <QuickInfoDocumentationText>
            {documentationContent}
          </QuickInfoDocumentationText>
        ) : undefined
      }
      theme={theme}
      css={css}
      className={className}
      style={style}
      testIds={{
        container: 'quick-info-popover',
        content: getQuickInfoTestId('content'),
        divider: getQuickInfoTestId('divider'),
      }}
    />
  )
}

function useActiveThemeName(anchorId: string | undefined): string | undefined {
  return React.useSyncExternalStore(
    subscribeToQuickInfoThemeChanges,
    () => readActiveThemeName(anchorId),
    () => readActiveThemeName(anchorId)
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
            <QuickInfoDisplayToken
              key={tokenIndex}
              style={resolveDisplayTokenStyle(token.style)}
            >
              {token.value}
            </QuickInfoDisplayToken>
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

function resolveQuickInfoTokenThemeConfig(
  themeConfig: QuickInfoRequest['themeConfig'],
  activeThemeName: string | undefined
): QuickInfoRequest['themeConfig'] {
  if (!themeConfig || typeof themeConfig === 'string' || Array.isArray(themeConfig)) {
    return themeConfig
  }

  const themeNames = Object.keys(themeConfig)
  if (themeNames.length === 0) {
    return themeConfig
  }

  const selectedThemeName =
    activeThemeName &&
    Object.prototype.hasOwnProperty.call(themeConfig, activeThemeName)
      ? activeThemeName
      : themeNames[0]

  if (!selectedThemeName) {
    return themeConfig
  }

  return {
    [selectedThemeName]: themeConfig[selectedThemeName]!,
  }
}

function readActiveThemeName(anchorId: string | undefined): string | undefined {
  if (typeof document === 'undefined') {
    return undefined
  }

  const anchorNode =
    typeof anchorId === 'string' && anchorId.length > 0
      ? document.getElementById(anchorId)
      : null
  const themedElement = anchorNode?.closest('[data-theme]')
  if (themedElement instanceof HTMLElement) {
    const themedName = themedElement.getAttribute('data-theme')
    if (typeof themedName === 'string' && themedName.length > 0) {
      return themedName
    }
  }

  const documentTheme = document.documentElement.getAttribute('data-theme')
  if (typeof documentTheme === 'string' && documentTheme.length > 0) {
    return documentTheme
  }

  const bodyTheme = document.body?.getAttribute('data-theme')
  if (typeof bodyTheme === 'string' && bodyTheme.length > 0) {
    return bodyTheme
  }

  return undefined
}

function subscribeToQuickInfoThemeChanges(onStoreChange: () => void): () => void {
  if (
    typeof document === 'undefined' ||
    typeof MutationObserver !== 'function'
  ) {
    return () => {}
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (
        mutation.type === 'attributes' &&
        mutation.attributeName === 'data-theme'
      ) {
        onStoreChange()
        return
      }
    }
  })

  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
    subtree: true,
  })

  return () => {
    observer.disconnect()
  }
}

function renderQuickInfoDocumentationContent(
  documentationText: string
): React.ReactNode | null {
  const content = renderQuickInfoDocumentationInline(documentationText)
  if (content.length === 0) {
    return null
  }

  return content
}

function renderQuickInfoDocumentationInline(
  value: string
): React.ReactNode[] {
  const content = value.replace(/\r\n?/g, '\n').trim()
  if (content.length === 0) {
    return []
  }

  const inlineNodes: React.ReactNode[] = []
  let cursor = 0

  for (const match of content.matchAll(QUICK_INFO_DOCUMENTATION_TOKEN_PATTERN)) {
    const matchIndex = match.index ?? -1
    if (matchIndex > cursor) {
      pushQuickInfoDocumentationText(
        content.slice(cursor, matchIndex),
        inlineNodes
      )
    }

    const token = match[0]
    if (token.startsWith('[')) {
      const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
      if (linkMatch) {
        inlineNodes.push(
          <DocumentationLink
            href={linkMatch[2]}
            key={`link:${matchIndex}:${linkMatch[2]}`}
            rel="noreferrer"
            target="_blank"
          >
            {linkMatch[1]}
          </DocumentationLink>
        )
      } else {
        pushQuickInfoDocumentationText(token, inlineNodes)
      }
    } else {
      inlineNodes.push(
        <DocumentationInlineCode key={`code:${matchIndex}`}>
          {token.slice(1, -1)}
        </DocumentationInlineCode>
      )
    }

    cursor = matchIndex + token.length
  }

  if (cursor < content.length) {
    pushQuickInfoDocumentationText(content.slice(cursor), inlineNodes)
  }

  return inlineNodes
}

function pushQuickInfoDocumentationText(
  value: string,
  target: React.ReactNode[]
): void {
  const collapsed = value.replace(/\s+/g, ' ')
  const trimmed = collapsed.trim()
  if (trimmed.length === 0) {
    return
  }

  target.push(
    `${/^\s/.test(collapsed) ? ' ' : ''}${trimmed}${/\s$/.test(collapsed) ? ' ' : ''}`
  )
}

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

const DocumentationLink = styled('a', {
  color: 'inherit',
  textDecoration: 'underline',
})

const DocumentationInlineCode = styled('code', {
  fontFamily: 'monospace',
  fontSize: '0.95em',
})
