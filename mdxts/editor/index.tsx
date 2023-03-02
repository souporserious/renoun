import * as React from 'react'
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api'
import { initializeMonaco } from './initialize'
import { getTheme } from './theme'

let isMonacoInitialized = false

export default function Editor({
  defaultValue,
  language = 'typescript',
  ...props
}: {
  defaultValue?: string
  language?: string
}) {
  const id = React.useId().slice(1, -1)
  const ref = React.useRef(null)

  React.useLayoutEffect(() => {
    if (!isMonacoInitialized) {
      initializeMonaco()
      isMonacoInitialized = true
    }

    const model = monaco.editor.createModel(
      defaultValue,
      language,
      monaco.Uri.parse(`file:///${id}.index.tsx`)
    )

    const editor = monaco.editor.create(ref.current, {
      model,
      language,
      theme: 'vs-dark',
      automaticLayout: true,
      ...props,
    })

    /* Convert VS Code theme to Monaco theme */
    // TODO: this should allow setting multiple themes that are all defined at the same time e.g. <Editor theme="night-owl" />
    try {
      monaco.editor.defineTheme(
        'mdxts',
        getTheme(JSON.parse(process.env.MDXTS_THEME))
      )
      monaco.editor.setTheme('mdxts')
    } catch (error) {
      throw new Error(
        `MDXTS: Invalid theme configuration. Make sure theme is set to a path that exists and defines a valid VS Code theme.`,
        { cause: error }
      )
    }

    return () => {
      model.dispose()
      editor.dispose()
    }
  }, [])

  return <div ref={ref} style={{ height: 400 }} />
}
