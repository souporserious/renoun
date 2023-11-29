import React, { Fragment } from 'react'
import { type Diagnostic } from 'ts-morph'
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
}: {
  bounds: any
  filename: string
  highlighter: any
  language: string
  theme: any
  diagnostics: Diagnostic[]
  edit: any
  isQuickInfoOpen?: boolean
}) {
  const quickInfo = languageService.getQuickInfoAtPosition(
    filename,
    bounds.start
  )

  if (!quickInfo) {
    return null
  }

  const displayParts = quickInfo.displayParts || []
  const documentation = quickInfo.documentation || []
  const directoryPathToTrim = process.cwd().replace('site', '')
  const displayText = displayParts
    .map((part) => part.text)
    .join('')
    .replace(directoryPathToTrim, '')
  const docText = documentation
    .map((part) => part.text)
    .join('')
    .replace(directoryPathToTrim, '')
  const displayTextTokens = highlighter(displayText, language)
  return (
    <QuickInfoContainer
      style={{
        pointerEvents: 'auto',
        position: 'absolute',
        translate: bounds.top < 40 ? '0px 20px' : '0px -100%',
        fontSize: 13,
        lineHeight: '20px',
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
              padding: '4px 8px',
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
      <div style={{ padding: '4px 8px' }}>
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
          <p style={{ fontSize: 'inherit', padding: '4px 8px', margin: 0 }}>
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
            padding: '4px 8px',
          }}
        >
          <button
            style={{
              letterSpacing: '0.015em',
              fontWeight: 600,
              fontSize: '0.8rem',
              padding: '0.25rem 0.5rem',
              border: '1px solid #0479df',
              borderRadius: '6px',
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
