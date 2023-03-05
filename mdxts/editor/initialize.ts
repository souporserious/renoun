import * as monaco from 'monaco-editor/esm/vs/editor/editor.api'
// import { wireTmGrammars } from 'monaco-editor-textmate'
import { IRawGrammar, Registry, parseRawGrammar } from 'vscode-textmate'
import { createOnigScanner, createOnigString, loadWASM } from 'vscode-oniguruma'
import { wireTmGrammars } from './textmate'

export type ScopeName = string

const grammarPaths: Record<string, any> = {
  // 'source.js': {
  //   language: 'javascript',
  //   path: 'javascript.tmLanguage.json',
  // },
  // 'source.jsx': {
  //   language: 'javascript',
  //   path: 'jsx.tmLanguage.json',
  // },
  // 'source.ts': {
  //   language: 'typescript',
  //   path: 'typescript.tmLanguage.json',
  // },
  'source.tsx': {
    language: 'typescript',
    path: 'tsx.tmLanguage.json',
  },
}

async function loadVSCodeOnigurumWASM(): Promise<Response | ArrayBuffer> {
  const { default: onigasmPath } = await import(
    // @ts-expect-error
    'vscode-oniguruma/release/onig.wasm'
  )
  const response = await fetch(onigasmPath)
  const contentType = (response as any).headers.get('content-type')

  if (contentType === 'application/wasm') {
    return response
  }

  // Using the response directly only works if the server sets the MIME type 'application/wasm'.
  // Otherwise, a TypeError is thrown when using the streaming compiler.
  // We therefore use the non-streaming compiler :(.
  return await (response as any).arrayBuffer()
}

export async function initializeMonaco(editor: any) {
  try {
    const data: ArrayBuffer | Response = await loadVSCodeOnigurumWASM()
    loadWASM(data)
  } catch (error) {
    console.error(`Failed to load vscode-oniguruma: ${error}`)
  }

  const registry = new Registry({
    onigLib: Promise.resolve({
      createOnigScanner,
      createOnigString,
    }),
    async loadGrammar(scopeName: ScopeName): Promise<IRawGrammar | null> {
      const { path } = grammarPaths[scopeName]
      const uri = `/mdxts/${path}`
      const response = await fetch(uri)
      const grammar = await response.text()
      const type = path.endsWith('.json') ? 'json' : 'plist'

      return parseRawGrammar(grammar, `example.${type}`)
    },
    theme: JSON.parse(process.env.MDXTS_THEME),
  })
  const grammars = new Map()

  grammars.set('typescript', 'source.tsx')

  monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
    jsx: monaco.languages.typescript.JsxEmit.Preserve,
    esModuleInterop: true,
  })

  /* Wire up TextMate grammars */
  await wireTmGrammars(monaco, registry, grammars, editor)
}
