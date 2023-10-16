import * as React from 'react'
import { getHighlighter } from 'shiki'

const languageMap = {
  tsx: 'typescript',
}

export async function highlight(code: string, language: string) {
  const highlighter = await getHighlighter({
    theme: 'nord',
    langs: ['bash', 'mdx', 'javascript', 'typescript'],
  })
  return highlighter.codeToThemedTokens(code, language)
}

export type CodeProps = {
  value: string
  language: string
}

export async function Code({
  value,
  language: languageProp,
}: {
  value: string
  language: string
}) {
  const language = languageMap[languageProp] || languageProp
  const tokens = await highlight(value, language)
  return (
    <pre>
      {tokens.map((line, index) => (
        <div key={index}>
          {line.map((token, index) => (
            <span key={index} style={{ color: token.color }}>
              {token.content}
            </span>
          ))}
        </div>
      ))}
    </pre>
  )
}
