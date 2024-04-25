import React, { Fragment } from 'react'
import type { Diagnostic } from 'ts-morph'
import { getDiagnosticMessageText } from '@tsxmod/utils'

import { getTheme } from '../../index'
import { MDXContent } from '../MDXContent'
import { QuickInfoPopover } from './QuickInfoPopover'
import { getTokens } from './get-tokens'

export async function QuickInfo({
  diagnostics,
  quickInfo,
  style,
}: {
  diagnostics?: Diagnostic[]
  quickInfo?: { displayText: string; documentationText: string }
  style?: React.CSSProperties
}) {
  const theme = getTheme()
  const displayTextTokens = quickInfo?.displayText
    ? await getTokens(quickInfo.displayText, 'ts')
    : []

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
          ...style,
        }}
      >
        <div
          style={{
            fontSize: '0.875rem',
            lineHeight: '1.4rem',
          }}
        >
          {diagnostics ? (
            <div style={{ padding: '0.25rem 0.5rem' }}>
              {diagnostics.map((diagnostic, index) => (
                <div key={index} style={{ display: 'flex', gap: '0.5rem' }}>
                  {getDiagnosticMessageText(diagnostic.getMessageText())}
                  <span style={{ opacity: 0.7 }}>({diagnostic.getCode()})</span>
                </div>
              ))}
            </div>
          ) : null}

          {displayTextTokens.length ? (
            <>
              {diagnostics ? (
                <hr
                  style={{
                    height: 1,
                    border: 'none',
                    backgroundColor: theme.colors['panel.border'],
                    opacity: 0.5,
                  }}
                />
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
                        {token.value}
                      </span>
                    ))}
                  </Fragment>
                ))}
              </div>
            </>
          ) : null}

          {quickInfo?.documentationText.length ? (
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
                value={quickInfo.documentationText}
              />
            </>
          ) : null}
        </div>
      </div>
    </QuickInfoPopover>
  )
}
