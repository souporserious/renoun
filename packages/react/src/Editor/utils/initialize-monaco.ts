import { wireTmGrammars } from 'monaco-editor-textmate'
import { Registry } from 'monaco-textmate'
import { loadWASM } from 'onigasm'
import theme from './theme.json'

import defineTheme from './define-theme'

export type InitializeMonacoOptions = {
  container: HTMLElement
  monaco: any
  defaultValue?: string
  id?: number
  lineNumbers?: boolean
  folding?: boolean
  fontSize?: number
  onOpenEditor?: (input: any, source: any) => void
}

export async function initializeMonaco({
  container,
  monaco,
  defaultValue = '',
  id = 0,
  lineNumbers = true,
  folding = true,
  fontSize = 18,
  onOpenEditor = () => null,
}: InitializeMonacoOptions) {
  try {
    await loadWASM('/onigasm.wasm')
  } catch {
    // try/catch prevents onigasm from erroring on fast refreshes
  }

  const registry = new Registry({
    // @ts-ignore
    getGrammarDefinition: async (scopeName) => {
      switch (scopeName) {
        case 'source.tsx':
          return {
            format: 'json',
            content: await (await fetch('/tsx.tmLanguage.json')).text(),
          }
        default:
          return null
      }
    },
  })

  const grammars = new Map()

  grammars.set('typescript', 'source.tsx')

  const model = monaco.editor.createModel(
    defaultValue,
    'typescript',
    monaco.Uri.parse(`file:///index-${id}.tsx`)
  )

  const editor = monaco.editor.create(container, {
    model,
    fontSize,
    fontFamily: 'var(--font-family-mono)',
    lineNumbers: lineNumbers ? 'on' : 'off',
    folding: folding,
    automaticLayout: true,
    language: 'typescript',
    contextmenu: false,
    theme: 'vs-dark',
    formatOnPaste: true,
    formatOnType: true,
    minimap: { enabled: false },
  })

  // @ts-ignore
  const editorService = editor._codeEditorService
  const openEditorBase = editorService.openCodeEditor.bind(editorService)

  editorService.openCodeEditor = async (input, source) => {
    const result = await openEditorBase(input, source)
    if (result === null) {
      onOpenEditor(input, source)
    }
    return result
  }

  monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
    jsx: monaco.languages.typescript.JsxEmit.Preserve,
    esModuleInterop: true,
  })

  /**
   * Convert VS Code theme to Monaco theme
   */
  defineTheme(monaco, theme)

  await wireTmGrammars(monaco, registry, grammars)

  return editor
}
