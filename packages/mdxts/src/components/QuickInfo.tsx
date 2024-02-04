import React, { Fragment } from 'react'
import { type ts, type Diagnostic } from 'ts-morph'

import { type getHighlighter } from './highlighter'
import { languageService } from './project'
import { getDiagnosticMessageText } from './diagnostics'
import { MDX } from './MDX'
import { QuickInfoPopover } from './QuickInfoPopover'

export function QuickInfo({
  position,
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
  position: number
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
  const quickInfo = languageService.getQuickInfoAtPosition(filename, position)

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
  const displayText = formatDisplayParts(displayParts)
  const displayTextTokens = highlighter(displayText, language)
  const documentation = quickInfo.documentation || []
  const documentationText = formatDisplayParts(documentation)

  return (
    <QuickInfoPopover>
      <div
        style={{
          fontSize: '1rem',
          position: 'absolute',
          zIndex: 1000,
          width: 'max-content',
          maxWidth: 540,
          borderRadius: 3,
          border: `1px solid ${theme.colors['editorHoverWidget.border']}`,
          backgroundColor: theme.colors['editorHoverWidget.background'],
          overflow: 'auto',
        }}
      >
        <div
          style={{
            fontSize: '0.875rem',
            lineHeight: '1.4rem',
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
                    <span style={{ opacity: 0.7 }}>
                      ({diagnostic.getCode()})
                    </span>
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
          <div style={{ whiteSpace: 'pre-wrap', padding: '0.25rem 0.5rem' }}>
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
          {documentationText ? (
            <>
              <hr
                style={{
                  height: 1,
                  border: 'none',
                  backgroundColor: theme.colors['editorHoverWidget.border'],
                  opacity: 0.5,
                }}
              />
              <MDX
                components={{
                  p: ({ children }) => (
                    <p
                      style={{
                        fontFamily: 'sans-serif',
                        fontSize: 'inherit',
                        lineHeight: 'inherit',
                        padding: '0.25rem 0.5rem',
                        margin: 0,
                      }}
                    >
                      {children}
                    </p>
                  ),
                }}
                value={documentationText}
              />
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
        </div>
      </div>
    </QuickInfoPopover>
  )
}
