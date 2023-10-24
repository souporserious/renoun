import * as React from 'react'
import { languageService } from './project'

export function QuickInfo({
  filename,
  position,
  highlighter,
  language,
  theme,
  x,
  y,
}: {
  filename: string
  position: number
  highlighter: any
  language: string
  theme: any
  x: number | string
  y: number | string
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
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        translate: '0px -100%',
        fontSize: 13,
        zIndex: 1000,
        borderRadius: 3,
        border: `1px solid ${theme.colors['editorHoverWidget.border']}`,
        backgroundColor: theme.colors['editorHoverWidget.background'],
      }}
    >
      <div style={{ padding: '5px 0px' }}>
        {displayTextTokens.map((line, index) => {
          return (
            <div key={index} style={{ lineHeight: '20px', padding: '0px 8px' }}>
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
    </div>
  )
}
