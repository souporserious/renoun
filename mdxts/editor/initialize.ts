import * as monaco from 'monaco-editor/esm/vs/editor/editor.api'
import { wireTmGrammars } from 'monaco-editor-textmate'
import { Registry } from 'monaco-textmate'
import { loadWASM } from 'onigasm'

export async function initializeMonaco(editor: any) {
  // @ts-expect-error
  const { default: onigasmPath } = await import('onigasm/lib/onigasm.wasm')

  try {
    await loadWASM(onigasmPath)
  } catch {
    // try/catch prevents onigasm from erroring on fast refreshes
  }

  const registry = new Registry({
    getGrammarDefinition: async (scopeName) => {
      switch (scopeName) {
        case 'source.js':
          return {
            format: 'json',
            content: await (
              await fetch('/mdxts/javascript.tmLanguage.json')
            ).text(),
          }
        case 'source.jsx':
          return {
            format: 'json',
            content: await (await fetch('/mdxts/jsx.tmLanguage.json')).text(),
          }
        case 'source.ts':
          return {
            format: 'json',
            content: await (
              await fetch('/mdxts/typescript.tmLanguage.json')
            ).text(),
          }
        case 'source.tsx':
          return {
            format: 'json',
            content: await (await fetch('/mdxts/tsx.tmLanguage.json')).text(),
          }
        default:
          return null
      }
    },
  })

  const grammars = new Map()

  grammars.set('javascript', 'source.js')
  grammars.set('javascript', 'source.jsx')
  grammars.set('typescript', 'source.ts')
  grammars.set('typescript', 'source.tsx')

  monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
    jsx: monaco.languages.typescript.JsxEmit.Preserve,
    esModuleInterop: true,
  })

  /* Wire up TextMate grammars */
  await wireTmGrammars(monaco, registry, grammars, editor)
}
