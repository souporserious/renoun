import type { Registry, StateStack } from 'vscode-textmate'
import { INITIAL } from 'vscode-textmate'
import * as monaco from 'monaco-editor'

// as described in issue: https://github.com/NeekSandhu/monaco-textmate/issues/5
export const TMToMonacoToken = (
  editor: monaco.editor.ICodeEditor,
  scopes: string[]
) => {
  let scopeName = ''
  // get the scope name. Example: cpp , java, haskell
  for (let index = scopes[0].length - 1; index >= 0; index -= 1) {
    const char = scopes[0][index]
    if (char === '.') {
      break
    }
    scopeName = char + scopeName
  }

  // iterate through all scopes from last to first
  for (let index = scopes.length - 1; index >= 0; index -= 1) {
    const scope = scopes[index]

    /**
     * Try all possible tokens from high specific token to low specific token
     *
     * Example:
     * 0 meta.function.definition.parameters.cpp
     * 1 meta.function.definition.parameters
     *
     * 2 meta.function.definition.cpp
     * 3 meta.function.definition
     *
     * 4 meta.function.cpp
     * 5 meta.function
     *
     * 6 meta.cpp
     * 7 meta
     */
    for (let index = scope.length - 1; index >= 0; index -= 1) {
      const char = scope[index]
      if (char === '.') {
        const token = scope.slice(0, index) + '.' + scopeName
        const theme = editor['_themeService'].getColorTheme()

        if (
          theme._tokenTheme._match(token)._foreground !==
          theme._tokenTheme._root._mainRule._foreground
        ) {
          return token
        }
      }
    }
  }

  return ''
}

class TokenizerState implements monaco.languages.IState {
  constructor(private _ruleStack: StateStack) {}

  public get ruleStack(): StateStack {
    return this._ruleStack
  }

  public clone(): TokenizerState {
    return new TokenizerState(this._ruleStack)
  }

  public equals(other: monaco.languages.IState): boolean {
    if (
      !other ||
      !(other instanceof TokenizerState) ||
      other !== this ||
      other._ruleStack !== this._ruleStack
    ) {
      return false
    }
    return true
  }
}

/** Wires up monaco-editor with monaco-textmate */
export function wireTextMateGrammars(
  /** TmGrammar `Registry` this wiring should rely on to provide the grammars. */
  registry: Registry,

  /** `Map` of language ids (string) to TM names (string). */
  languages: Map<string, string>,

  /** The monaco editor instance to wire up. */
  editor: monaco.editor.ICodeEditor
) {
  return Promise.all(
    Array.from(languages.keys()).map(async (languageId) => {
      const grammar = await registry.loadGrammar(languages.get(languageId))
      monaco.languages.setTokensProvider(languageId, {
        getInitialState: () => new TokenizerState(INITIAL),
        tokenize: (line: string, state: TokenizerState) => {
          const result = grammar.tokenizeLine(line, state.ruleStack)

          return {
            endState: new TokenizerState(result.ruleStack),
            tokens: result.tokens.map((token) => ({
              ...token,
              scopes: TMToMonacoToken(editor, token.scopes),
            })),
          }
        },
      })
    })
  )
}
