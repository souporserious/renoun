import * as React from 'react'
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api'
import { initializeMonaco } from './initialize'
import { getTheme } from './theme'
import defaultTheme from './theme.json'

export default function Editor({ theme, ...props }: { theme?: any }) {
  const id = React.useId().slice(1, -1)
  const ref = React.useRef(null)

  React.useLayoutEffect(() => {
    const model = monaco.editor.createModel(
      `export function Hello() {
      return <h1>Hello world!</h1>
    }`,
      'typescript',
      monaco.Uri.parse(`file:///${id}.index.tsx`)
    )

    const editor = monaco.editor.create(ref.current, {
      model,
      language: 'typescript',
      automaticLayout: true,
      ...props,
    })

    initializeMonaco()

    /* Convert VS Code theme to Monaco theme */
    if (theme && monaco.editor.defineTheme) {
      try {
        monaco.editor.defineTheme('mdxts', getTheme(defaultTheme))
        monaco.editor.setTheme('mdxts')
      } catch (error) {
        console.error(error)
      }
    }

    return () => {
      model.dispose()
      editor.dispose()
    }
  }, [])

  return <div ref={ref} style={{ height: 400 }} />
}
