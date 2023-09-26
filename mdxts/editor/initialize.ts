import * as monaco from 'monaco-editor/esm/vs/editor/editor.api'
import { IRawGrammar, Registry, parseRawGrammar } from 'vscode-textmate'
import { createOnigScanner, createOnigString, loadWASM } from 'vscode-oniguruma'
import { wireTextMateGrammars } from './textmate'

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
  const grammars = {
    'source.ts': {
      language: 'typescript',
      path: './TypeScript.tmLanguage.json',
      grammar: JSON.stringify(
        (await import('./grammars/TypeScript.tmLanguage.json')).default
      ),
    },
    'source.tsx': {
      language: 'typescript',
      path: './TypeScriptReact.tmLanguage.json',
      grammar: JSON.stringify(
        (await import('./grammars/TypeScriptReact.tmLanguage.json')).default
      ),
    },
  }

  await loadVSCodeOnigurumWASM()

  const registry = new Registry({
    onigLib: Promise.resolve({
      createOnigScanner,
      createOnigString,
    }),
    async loadGrammar(scopeName: string): Promise<IRawGrammar | null> {
      const grammarConfig = grammars[scopeName]

      if (!grammarConfig) {
        throw new Error(`No grammar found for scope name ${scopeName}`)
      }

      return parseRawGrammar(grammarConfig.grammar, grammarConfig.path)
    },
    theme,
  })

  monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
    target: monaco.languages.typescript.ScriptTarget.ESNext,
    jsx: monaco.languages.typescript.JsxEmit.ReactJSX,
    jsxImportSource: monaco.languages.typescript.JsxEmit.React,
    moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
    module: monaco.languages.typescript.ModuleKind.ESNext,
  })

  await wireTextMateGrammars(registry, grammars, editor)
}
