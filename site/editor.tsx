import * as React from 'react'
import { Editor as ClientEditor } from 'mdxts/components/client'
import type { EditorProps } from 'mdxts/components/client'
import { Code } from 'mdxts/components'

/** Renders a code editor with syntax highlighting, type information, and autocomplete. */
export function Editor({
  defaultValue,
  language,
  theme,
}: Omit<EditorProps, 'onChange' | 'value'>) {
  return (
    <ClientEditor defaultValue={defaultValue} language={language} theme={theme}>
      <Code value={defaultValue} language={language} theme={theme} />
    </ClientEditor>
  )
}
