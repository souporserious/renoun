import type { IRawTheme, Registry, StateStack } from 'vscode-textmate'
import { INITIAL } from 'vscode-textmate'
import * as monaco from 'monaco-editor'
// import { addScopesToLine, getStyle, tokenizeLine } from './tokenizer'

class TokenizerState implements monaco.languages.IState {
  constructor(private _ruleStack: StateStack) {}

  public get ruleStack(): StateStack {
    return this._ruleStack
  }

  public clone(): TokenizerState {
    return new TokenizerState(this._ruleStack)
  }

  public equals(other: monaco.languages.IState): boolean {
    return (
      other instanceof TokenizerState &&
      (other === this || other.ruleStack === this.ruleStack)
    )
  }
}

function getColorMap(registry: Registry, theme: any) {
  const colorMap = registry.getColorMap()
  if (!theme.colorNames) return colorMap
  return colorMap.map((c) => {
    const key = Object.keys(theme.colorNames).find(
      (key) => theme.colorNames[key].toUpperCase() === c.toUpperCase()
    )
    return key || c
  })
}

/** Wires up monaco-editor with monaco-textmate */
export async function wireTextMateGrammars(
  /** TmGrammar `Registry` this wiring should rely on to provide the grammars. */
  registry: Registry,

  /** Record of textmate grammar information. */
  grammars: Record<string, { language: string; path: string }>,

  /** VS Code compatible syntax theme. */
  theme: IRawTheme
) {
  registry.setTheme(theme)

  const colorMap = getColorMap(registry, theme)

  await Promise.all(
    Object.keys(grammars).map(async (scopeName) => {
      const { language } = grammars[scopeName]
      const grammar = await registry.loadGrammar(scopeName)

      if (!grammar) {
        throw new Error(`No grammar found for scope name ${scopeName}`)
      }

      monaco.languages.setTokensProvider(language, {
        getInitialState: () => new TokenizerState(INITIAL),
        tokenize: (line: string, state: TokenizerState) => {
          const { tokens, ruleStack } = grammar.tokenizeLine(
            line,
            state.ruleStack
          )
          return {
            endState: new TokenizerState(ruleStack),
            tokens: tokens.map((token) => {
              return {
                startIndex: token.startIndex,
                scopes: token.scopes.at(-1),
                // scopes: token.scopes.reverse().join(' '),
              } satisfies monaco.languages.IToken
            }),
          }
        },
        // tokenize: (line: string, state: TokenizerState) => {
        //   const { rawTokens, nextStack } = tokenizeLine(
        //     grammar,
        //     state.ruleStack,
        //     line,
        //     { preserveWhitespace: true }
        //   )
        //   const newTokens = rawTokens.map(({ content, metadata }) => ({
        //     content,
        //     style: getStyle(metadata, colorMap),
        //   }))
        //   const tokensWithScopes = addScopesToLine(
        //     line,
        //     state.ruleStack,
        //     grammar,
        //     newTokens
        //   )

        //   return {
        //     endState: new TokenizerState(nextStack),
        //     tokens: tokensWithScopes.map((token) => {
        //       return {
        //         startIndex: token.startIndex,
        //         scopes: token.scopes.at(0),
        //       } satisfies monaco.languages.IToken
        //     }),
        //   }
        // },
      })
    })
  )
}
