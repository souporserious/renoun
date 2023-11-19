import * as React from 'react'
import { type Diagnostic } from 'ts-morph'
import { languageService } from './project'
import { getDiagnosticMessageText } from './diagnostics'

export function QuickInfo({
  bounds,
  filename,
  position,
  highlighter,
  language,
  theme,
  diagnostics,
  edit,
  isQuickInfoOpen,
}: {
  bounds: any
  filename: string
  position: number
  highlighter: any
  language: string
  theme: any
  diagnostics: Diagnostic[]
  edit: any
  isQuickInfoOpen?: boolean
}) {
  const quickInfo = languageService.getQuickInfoAtPosition(filename, position)

  if (!quickInfo) {
    return null
  }

  const displayParts = quickInfo.displayParts || []
  const documentation = quickInfo.documentation || []
  const displayText = displayParts.map((part) => part.text).join('')
  const docText = documentation.map((part) => part.text).join('')
  const displayTextTokens = highlighter(displayText, language)

  return (
    <>
      <div
        style={{
          position: 'absolute',
          translate: bounds.top < 40 ? '0px 20px' : '0px -100%',
          fontSize: 13,
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
                padding: '5px 8px',
                fontSize: 13,
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
              }}
            />
          </>
        ) : null}
        <div style={{ padding: '5px 0px' }}>
          {displayTextTokens.map((line, index) => {
            return (
              <div
                key={index}
                style={{ lineHeight: '20px', padding: '0px 8px' }}
              >
                {line.map((token, index) => {
                  return (
                    <span key={index} style={{ color: token.color }}>
                      {token.content}
                    </span>
                  )
                })}
              </div>
            )
          })}
        </div>
        {docText ? (
          <>
            <hr
              style={{
                height: 1,
                border: 'none',
                backgroundColor: theme.colors['editorHoverWidget.border'],
                opacity: 0.5,
              }}
            />
            <p style={{ fontSize: 13, padding: '5px 8px', margin: 0 }}>
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
              padding: '5px 8px',
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
      </div>
    </>
  )
}
