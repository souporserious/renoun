import { IRawGrammar, Registry, parseRawGrammar } from 'vscode-textmate'
import { createOnigScanner, createOnigString, loadWASM } from 'vscode-oniguruma'
import { wireTextMateGrammars } from './textmate'

let registry: Registry | null = null

export async function initializeMonaco(theme: any) {
  const grammars = {
    'source.css': {
      language: 'css',
      path: './css.tmLanguage.json',
      grammar: JSON.stringify(
        (await import('./grammars/css.tmLanguage.json')).default
      ),
    },
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

  if (!registry) {
    const onigasmModule = await import(
      // @ts-expect-error
      'vscode-oniguruma/release/onig.wasm'
    )
    const response = await fetch(onigasmModule.default)

    try {
      const data: ArrayBuffer | Response = await (response as any).arrayBuffer()
      loadWASM(data)
    } catch (error) {
      throw new Error('Failed to load vscode-oniguruma', { cause: error })
    }

    registry = new Registry({
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
    })
  }

  await wireTextMateGrammars(registry, grammars, theme)
}
