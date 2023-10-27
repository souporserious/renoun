import * as React from 'react'
import { Editor as ClientEditor } from './client/Editor'
import type { EditorProps } from './client/Editor'
import { Code } from './Code'

/** Renders a code editor with syntax highlighting, type information, and autocomplete. */
export function Editor({
  defaultValue,
  language,
  filename,
  lineNumbers,
  highlight,
  theme,
}: Omit<EditorProps, 'onChange' | 'value'>) {
  return (
    <ClientEditor
      defaultValue={defaultValue}
      filename={filename}
      language={language}
      lineNumbers={lineNumbers}
      highlight={highlight}
      theme={theme}
    >
      <Code
        value={defaultValue}
        filename={filename}
        language={language}
        lineNumbers={lineNumbers}
        highlight={highlight}
        theme={theme}
      />
    </ClientEditor>
  )
}
