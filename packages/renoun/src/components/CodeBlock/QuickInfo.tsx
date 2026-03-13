import React, { Fragment } from 'react'
import { type CSSObject } from 'restyle'

import { BASE_TOKEN_CLASS_NAME, getThemeColors } from '../../utils/get-theme.ts'
import { createConcurrentQueue } from '../../utils/concurrency.ts'
import type { TokenDiagnostic } from '../../utils/get-tokens.ts'
import { getConfig } from '../Config/ServerConfigContext.tsx'
import {
  createQuickInfoTheme,
  QuickInfoContent,
  QuickInfoDisplayText,
  QuickInfoDisplayToken,
} from './QuickInfoContent.tsx'
import { QuickInfoDocumentation } from './QuickInfoDocumentation.tsx'

const quickInfoQueue = createConcurrentQueue(1)
const QUICK_INFO_KEYWORDS = new Set([
  'abstract',
  'as',
  'asserts',
  'async',
  'await',
  'boolean',
  'break',
  'case',
  'catch',
  'class',
  'const',
  'constructor',
  'continue',
  'debugger',
  'declare',
  'default',
  'delete',
  'do',
  'else',
  'enum',
  'export',
  'extends',
  'false',
  'finally',
  'for',
  'from',
  'function',
  'get',
  'if',
  'implements',
  'import',
  'in',
  'infer',
  'instanceof',
  'interface',
  'is',
  'keyof',
  'let',
  'module',
  'namespace',
  'never',
  'new',
  'null',
  'number',
  'object',
  'of',
  'package',
  'private',
  'protected',
  'public',
  'readonly',
  'require',
  'return',
  'satisfies',
  'set',
  'static',
  'string',
  'super',
  'switch',
  'symbol',
  'this',
  'throw',
  'true',
  'try',
  'type',
  'typeof',
  'undefined',
  'unique',
  'unknown',
  'var',
  'void',
  'while',
  'with',
  'yield',
])
const QUICK_INFO_TOKEN_PATTERN =
  /('(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`|[A-Za-z_$][A-Za-z0-9_$]*|\d+(?:\.\d+)?|[\r\n]+|[ \t]+|[^\sA-Za-z0-9_$]+)/g

function enqueueQuickInfo<T>(task: () => Promise<T>) {
  return quickInfoQueue.run(task)
}

function renderHighlightedDisplayText(displayText: string): React.ReactNode {
  const parts = displayText.match(QUICK_INFO_TOKEN_PATTERN) ?? [displayText]

  return parts.map((part, index) => {
    if (part === '\n' || part === '\r\n' || part === '\r') {
      return <Fragment key={index}>{part}</Fragment>
    }

    let css: CSSObject | undefined

    if (/^['"`]/.test(part)) {
      css = {
        color: 'var(--renoun-quick-info-string, #ecc48d)',
      }
    } else if (QUICK_INFO_KEYWORDS.has(part)) {
      css = {
        color: 'var(--renoun-quick-info-keyword, #82aaff)',
        fontStyle: 'italic',
      }
    } else if (/^[A-Z][A-Za-z0-9_$]*$/.test(part)) {
      css = {
        color: 'var(--renoun-quick-info-type, #86e1fc)',
      }
    }

    return (
      <QuickInfoDisplayToken
        key={index}
        css={css}
        className={BASE_TOKEN_CLASS_NAME}
      >
        {part}
      </QuickInfoDisplayToken>
    )
  })
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
  const displayText = quickInfo?.displayText || ''

  return (
    <QuickInfoContent
      diagnostics={diagnostics}
      display={
        displayText.length ? (
          <QuickInfoDisplayText>
            {renderHighlightedDisplayText(displayText)}
          </QuickInfoDisplayText>
        ) : null
      }
      documentation={
        quickInfo?.documentationText.length ? (
          <QuickInfoDocumentation
            documentationText={quickInfo.documentationText}
            theme={quickInfoTheme}
          />
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
