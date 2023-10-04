import * as React from 'react'
import { Editor as ClientEditor } from '../client/Editor'
import type { EditorProps } from '../client/Editor'
import { Code } from './Code'

/** Renders a code editor with syntax highlighting, type information, and autocomplete. */
export function Editor({
  defaultValue,
  language,
  onChange,
  theme,
  value,
}: EditorProps) {
  return (
    <ClientEditor
      defaultValue={defaultValue}
      language={language}
      onChange={onChange}
      theme={theme}
      value={value}
    >
      <Code value={value} language={language} theme={theme} />
    </ClientEditor>
  )
}
