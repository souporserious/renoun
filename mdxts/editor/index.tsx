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
      monaco.editor.defineTheme('mdxts', getTheme(theme))
    } catch (error) {
      throw new Error(
        `MDXTS: Invalid theme configuration. Theme must be a valid VS Code theme.`,
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

    monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
      target: monaco.languages.typescript.ScriptTarget.ESNext,
      jsx: monaco.languages.typescript.JsxEmit.ReactJSX,
      jsxImportSource: monaco.languages.typescript.JsxEmit.React,
      moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
      module: monaco.languages.typescript.ModuleKind.ESNext,
    })

    const languages = [
      {
        id: 'css',
        extensions: ['.css'],
        aliases: ['CSS', 'css'],
      },
      {
        id: 'typescript',
        extensions: ['.ts', '.tsx'],
        aliases: ['TypeScript', 'ts', 'typescript'],
      },
    ]

    languages.forEach((config) => monaco.languages.register(config))

    initializeMonaco(theme)

    return () => {
      model.dispose()
      editor.dispose()
    }
  }, [])

  return <div ref={ref} style={{ height: 400 }} />
}
