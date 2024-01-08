import React, { Fragment } from 'react'
import { type ts, type Diagnostic } from 'ts-morph'

import { type getHighlighter } from './highlighter'
import { languageService } from './project'
import { getDiagnosticMessageText } from './diagnostics'
import { QuickInfoContainer } from './QuickInfoContainer'

export function QuickInfo({
  bounds,
  filename,
  highlighter,
  language,
  theme,
  diagnostics,
  edit,
  isQuickInfoOpen,
  rootDirectory = '',
  baseDirectory = '',
}: {
  bounds: any
  filename: string
  highlighter: Awaited<ReturnType<typeof getHighlighter>>
  language: string
  theme: any
  diagnostics: Diagnostic[]
  edit: any
  isQuickInfoOpen?: boolean
  rootDirectory?: string
  baseDirectory?: string
}) {
  const quickInfo = languageService.getQuickInfoAtPosition(
    filename,
    bounds.start
  )

  if (!quickInfo) {
    return null
  }

  const formatDisplayParts = (parts: ts.SymbolDisplayPart[]) =>
    parts
      .map((part) => part.text)
      .join('')
      // First, replace root directory to handle root node_modules
      .replace(rootDirectory, '.')
      // Next, replace base directory for on disk paths
      .replace(baseDirectory, '')
      // Finally, replace the in-memory mdxts directory
      .replace('/mdxts', '')
  const displayParts = quickInfo.displayParts || []
  const documentation = quickInfo.documentation || []
  const displayText = formatDisplayParts(displayParts)
  const docText = formatDisplayParts(documentation)
  const displayTextTokens = highlighter(displayText, language)
  return (
    <QuickInfoContainer
      style={{
        pointerEvents: 'auto',
        position: 'absolute',
        translate: '0 -100%',
        fontSize: '0.875rem',
        lineHeight: '1.4rem',
        maxWidth: 540,
        overflow: 'auto',
        zIndex: 1000,
        borderRadius: 3,
        border: `1px solid ${theme.colors['editorHoverWidget.border']}`,
        backgroundColor: theme.colors['editorHoverWidget.background'],
      }}
    >
      {diagnostics.length ? (
        <>
          <div
            style={{
              padding: '0.25rem 0.5rem',
              color: theme.colors['editorHoverWidget.foreground'],
            }}
          >
            {diagnostics.map((diagnostic, index) => (
              <div key={index}>
                {getDiagnosticMessageText(diagnostic.getMessageText())}
              </div>
            ))}
          </div>
          <hr
            style={{
              height: 1,
              border: 'none',
              backgroundColor: theme.colors['editorHoverWidget.border'],
              opacity: 0.5,
              position: 'sticky',
              left: 0,
            }}
          />
        </>
      ) : null}
      <div style={{ padding: '0.25rem 0.5rem' }}>
        {displayTextTokens.map((line, index) => (
          <Fragment key={index}>
            {index === 0 ? null : '\n'}
            {line.map((token, index) => (
              <span key={index} style={{ color: token.color }}>
                {token.content}
              </span>
            ))}
          </Fragment>
        ))}
      </div>
      {docText ? (
        <>
          <hr
            style={{
              height: 1,
              border: 'none',
              backgroundColor: theme.colors['editorHoverWidget.border'],
              opacity: 0.5,
              position: 'sticky',
              left: 0,
            }}
          />
          <p
            style={{
              fontSize: 'inherit',
              lineHeight: 'inherit',
              padding: '0.25rem 0.5rem',
              margin: 0,
            }}
          >
            {docText}
          </p>
        </>
      ) : null}
      {edit && diagnostics.length > 0 ? (
        <form
          action={edit}
          style={{
            display: 'flex',
            justifyContent: 'end',
            padding: '0.25rem 0.5rem',
          }}
        >
          <button
            style={{
              letterSpacing: '0.015em',
              fontWeight: 600,
              fontSize: 'var(--font-size-body-2)',
              padding: '0.25rem 0.5rem',
              border: '1px solid #0479df',
              borderRadius: '0.3rem',
              background: '#1871be',
              color: 'white',
            }}
          >
            {isQuickInfoOpen ? 'Hide' : 'Show'} Errors
          </button>
        </form>
      ) : null}
    </QuickInfoContainer>
  )
}
