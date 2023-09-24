import * as monaco from 'monaco-editor/esm/vs/editor/editor.api'
import { IRawGrammar, Registry, parseRawGrammar } from 'vscode-textmate'
import { createOnigScanner, createOnigString, loadWASM } from 'vscode-oniguruma'
import { wireTextMateGrammars } from './textmate'

export type ScopeName = string

const grammarPaths: Record<string, string> = {
  'source.ts': 'typescript.tmLanguage.json',
  'source.tsx': 'tsx.tmLanguage.json',
}

async function loadVSCodeOnigurumWASM() {
  const onigasmModule = await import(
    // @ts-expect-error
    'vscode-oniguruma/release/onig.wasm'
  )
  const response = await fetch(onigasmModule.default)
  try {
    const data: ArrayBuffer | Response = await (response as any).arrayBuffer()
    loadWASM(data)
  } catch (error) {
    console.error(`Failed to load vscode-oniguruma: ${error}`)
  }
}

export async function initializeMonaco(editor: any, theme: any) {
  await loadVSCodeOnigurumWASM()

  const registry = new Registry({
    onigLib: Promise.resolve({
      createOnigScanner,
      createOnigString,
    }),
    async loadGrammar(scopeName: ScopeName): Promise<IRawGrammar | null> {
      const path = grammarPaths[scopeName]
      const uri = `/mdxts/${path}`
      const response = await fetch(uri)
      const grammar = await response.text()

      return parseRawGrammar(grammar, path)
    },
    theme,
  })
  const grammars = new Map()

  grammars.set('typescript', 'source.ts')
  grammars.set('typescript', 'source.tsx')

  monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
    jsx: monaco.languages.typescript.JsxEmit.Preserve,
    esModuleInterop: true,
  })

  await wireTextMateGrammars(registry, grammars, editor)
}
