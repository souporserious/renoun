import type { Registry, StateStack } from 'vscode-textmate'
import { INITIAL } from 'vscode-textmate'
import * as monacoEditor from 'monaco-editor'

// as described in issue: https://github.com/NeekSandhu/monaco-textmate/issues/5
export const TMToMonacoToken = (
  editor: monacoEditor.editor.ICodeEditor,
  scopes: string[]
) => {
  let scopeName = ''
  // get the scope name. Example: cpp , java, haskell
  for (let i = scopes[0].length - 1; i >= 0; i -= 1) {
    const char = scopes[0][i]
    if (char === '.') {
      break
    }
    scopeName = char + scopeName
  }

  // iterate through all scopes from last to first
  for (let i = scopes.length - 1; i >= 0; i -= 1) {
    const scope = scopes[i]

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
    for (let i = scope.length - 1; i >= 0; i -= 1) {
      const char = scope[i]
      if (char === '.') {
        const token = scope.slice(0, i)
        if (
          editor['_themeService']._theme._tokenTheme._match(
            token + '.' + scopeName
          )._foreground > 1
        ) {
          return token + '.' + scopeName
        }
        if (
          editor['_themeService']._theme._tokenTheme._match(token)._foreground >
          1
        ) {
          return token
        }
      }
    }
  }

  return ''
}

class TokenizerState implements monacoEditor.languages.IState {
  constructor(private _ruleStack: StateStack) {}

  public get ruleStack(): StateStack {
    return this._ruleStack
  }

  public clone(): TokenizerState {
    return new TokenizerState(this._ruleStack)
  }

  public equals(other: monacoEditor.languages.IState): boolean {
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

/**
 * Wires up monaco-editor with monaco-textmate
 *
 * @param monaco monaco namespace this operation should apply to (usually the `monaco` global unless you have some other setup)
 * @param registry TmGrammar `Registry` this wiring should rely on to provide the grammars
 * @param languages `Map` of language ids (string) to TM names (string)
 */
export function wireTmGrammars(
  monaco: typeof monacoEditor,
  registry: Registry,
  languages: Map<string, string>,
  editor?: monacoEditor.editor.ICodeEditor
) {
  return Promise.all(
    Array.from(languages.keys()).map(async (languageId) => {
      const grammar = await registry.loadGrammar(languages.get(languageId))
      monaco.languages.setTokensProvider(languageId, {
        getInitialState: () => new TokenizerState(INITIAL),
        tokenize: (line: string, state: TokenizerState) => {
          const res = grammar.tokenizeLine(line, state.ruleStack)
          return {
            endState: new TokenizerState(res.ruleStack),
            tokens: res.tokens.map((token) => ({
              ...token,
              // TODO: At the moment, monaco-editor doesn't seem to accept array of scopes
              scopes: editor
                ? TMToMonacoToken(editor, token.scopes)
                : token.scopes[token.scopes.length - 1],
            })),
          }
        },
      })
    })
  )
}
