import React, { Fragment } from 'react'
import { type ts, type Diagnostic } from 'ts-morph'
import { getDiagnosticMessageText } from '@tsxmod/utils'

import { type getHighlighter } from './highlighter'
import { languageService } from './project'
import { MDXContent } from './MDXContent'
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

  const displayParts = quickInfo.displayParts || []
  const displayText = displayParts
    .map((part) => part.text)
    .join('')
    // First, replace root directory to handle root node_modules
    .replaceAll(rootDirectory, '.')
    // Next, replace base directory for on disk paths
    .replaceAll(baseDirectory, '')
    // Finally, replace the in-memory mdxts directory
    .replaceAll('/mdxts', '')
  const displayTextTokens = highlighter(displayText, language)
  const documentation = quickInfo.documentation || []
  const documentationText = formatDocumentationText(documentation)

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
          border: `1px solid ${theme.colors['panel.border']}`,
          backgroundColor: theme.colors['panel.background'],
          color: theme.colors['foreground'],
          overflow: 'auto',
          overscrollBehavior: 'contain',
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
              <div style={{ padding: '0.25rem 0.5rem' }}>
                {diagnostics.map((diagnostic, index) => (
                  <div key={index} style={{ display: 'flex', gap: '0.5rem' }}>
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
                  backgroundColor: theme.colors['panel.border'],
                  opacity: 0.5,
                }}
              />
            </>
          ) : null}
          <div
            style={{
              fontFamily: 'monospace',
              whiteSpace: 'pre-wrap',
              padding: '0.25rem 0.5rem',
            }}
          >
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
                  margin: 0,
                  border: 'none',
                  backgroundColor: theme.colors['panel.border'],
                  opacity: 0.5,
                }}
              />
              <MDXContent
                components={{
                  p: ({ children }) => (
                    <p
                      style={{
                        fontFamily: 'sans-serif',
                        fontSize: 'inherit',
                        lineHeight: 'inherit',
                        padding: '0.25rem 0.5rem',
                        margin: 0,
                        color: theme.colors['foreground'],
                        // @ts-expect-error
                        textWrap: 'pretty',
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

/** Convert documentation entries to markdown-friendly links. */
function formatDocumentationText(documentation: ts.SymbolDisplayPart[]) {
  let markdownText = ''
  let currentLinkText = ''
  let currentLinkUrl = ''

  documentation.forEach((part) => {
    if (part.kind === 'text') {
      markdownText += part.text
    } else if (part.kind === 'linkText') {
      const [url, ...descriptionParts] = part.text.split(' ')
      currentLinkUrl = url
      currentLinkText = descriptionParts.join(' ') || url
    } else if (part.kind === 'link') {
      if (currentLinkUrl) {
        markdownText += `[${currentLinkText}](${currentLinkUrl})`
        currentLinkText = ''
        currentLinkUrl = ''
      }
    }
  })

  return markdownText
}
