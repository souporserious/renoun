import * as React from 'react'
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api'
import { initializeMonaco } from './initialize'
import { getTheme } from './theme'

const languageMap = {
  tsx: 'typescript',
}

export default function Editor({
  defaultValue,
  language: languageProp = 'typescript',
  theme,
  ...props
}: {
  defaultValue?: string
  language?: string
  theme?: any
}) {
  const language = languageMap[languageProp] || languageProp
  const id = React.useId().slice(1, -1)
  const ref = React.useRef(null)

  React.useLayoutEffect(() => {
    try {
      /* Convert VS Code theme to Monaco theme */
      // TODO: this should allow setting multiple themes that are all defined at the same time e.g. <Editor theme="night-owl" />
      const parsedTheme = getTheme(theme)
      monaco.editor.defineTheme('mdxts', parsedTheme)
      monaco.editor.setTheme('mdxts')
    } catch (error) {
      throw new Error(
        `MDXTS: Invalid theme configuration. Make sure theme is set to a path that exists and defines a valid VS Code theme.`,
        { cause: error }
      )
    }

    const model = monaco.editor.createModel(
      defaultValue,
      language,
      monaco.Uri.parse(`file:///${id}.index.tsx`)
    )

    const editor = monaco.editor.create(ref.current, {
      model,
      language,
      theme: 'mdxts',
      automaticLayout: true,
      fontSize: 16,
      fontFamily: 'monospace',
      lineNumbers: 'off',
      minimap: { enabled: false },
      selectionHighlight: false,
      ...props,
    })

    initializeMonaco(editor, theme)

    return () => {
      model.dispose()
      editor.dispose()
    }
  }, [])

  return <div ref={ref} style={{ height: 400 }} />
}
