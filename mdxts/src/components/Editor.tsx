import * as React from 'react'
import { Editor as ClientEditor } from './client/Editor'
import type { EditorProps } from './client/Editor'
import { Code } from './Code'

export type { EditorProps } from './client/Editor'

/** Renders a code editor with syntax highlighting, type information, and autocomplete. */
export function Editor({
  defaultValue,
  language,
  filename,
  lineNumbers,
  highlight,
  theme,
  className,
}: Omit<EditorProps, 'onChange' | 'value'>) {
  return (
    <ClientEditor
      defaultValue={defaultValue}
      filename={filename}
      language={language}
      lineNumbers={lineNumbers}
      highlight={highlight}
      theme={theme}
      className={className}
    >
      <Code
        value={defaultValue}
        filename={filename}
        language={language}
        lineNumbers={lineNumbers}
        highlight={highlight}
        theme={theme}
        isNestedInEditor
      />
    </ClientEditor>
  )
}
