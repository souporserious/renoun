import type { Languages, ScopeName } from '../grammars/index.ts'
import { grammars } from '../grammars/index.ts'
import type {
  IGrammar,
  IRawGrammar,
  IRawTheme,
  StateStack,
} from './textmate.ts'
import { INITIAL, Registry as TextMateRegistryImpl } from './textmate.ts'

/** The options for the TextMate registry. */
export interface RegistryOptions<Theme extends string> {
  /** The function to get a grammar from the TextMate registry. */
  getGrammar: (scopeName: ScopeName) => Promise<TextMateGrammarRaw>

  /** The function to get a theme from the TextMate registry. */
  getTheme: (theme: Theme) => Promise<TextMateThemeRaw>
}

/** The grammar definition from the TextMate registry. */
export type TextMateGrammar = IGrammar

/** The raw grammar definition from the TextMate registry. */
export type TextMateGrammarRaw = IRawGrammar

/** The registry of TextMate grammars and themes. */
export type TextMateRegistry<Grammar extends string> = {
  getColorMap: () => string[]
  loadGrammar: (grammar: Grammar) => Promise<TextMateGrammar | null>
  setTheme: (theme: TextMateThemeRaw) => void
}

/** The raw theme definition from the TextMate registry. */
export type TextMateThemeRaw = IRawTheme & {
  type?: 'dark' | 'light'
  colors?: Record<string, string>
  semanticTokenColors?: Record<string, TextMateTokenSettings>
  tokenColors?: TextMateTokenColor[]
  settings?: IRawTheme['settings']
}

/** The color of a single token. */
export interface TextMateTokenColor {
  name?: string
  scope: string | string[]
  settings: TextMateTokenSettings
}

/** The settings of a single token. */
export interface TextMateTokenSettings {
  foreground?: string
  background?: string
  fontStyle?: string
}

/** The grammar state to seed the tokenization with per theme. */
export type GrammarState = Array<StateStack>

export interface TokenizeOptions {
  /**
   * The grammar state(s) to seed the tokenization with.
   *
   * - If a single state is provided, it is applied to all themes.
   * - If an array is provided, each entry is used as the state for the
   *   corresponding theme index.
   */
  grammarState?: StateStack | GrammarState

  /** The maximum time in milliseconds to spend tokenizing a single line. */
  timeLimit?: number
}

/** Raw tokenization result for a single line. */
export interface RawTokenizeResult {
  /** Raw tokens: [startPos, metadata, startPos, metadata, ...] */
  tokens: Uint32Array
  /** The original line text (for slicing) */
  lineText: string
  /** Grammar state for continuing to next line */
  ruleStack: StateStack
  /** True if stopped early due to time limit */
  stoppedEarly: boolean
}

/** Context needed for decoding raw tokens. */
export interface TokenizerContext {
  /** Color map for decoding foreground/background IDs */
  colorMap: readonly string[]
  /** Base foreground color for "is this the default color?" checks */
  baseColor: string
}

interface GrammarMetadata extends IRawGrammar {
  name?: string
  aliases?: string[]
}

export class Registry<Theme extends string> {
  #options: RegistryOptions<Theme>
  #registry: TextMateRegistryImpl
  #theme: TextMateThemeRaw | undefined

  constructor(options: RegistryOptions<Theme>) {
    this.#options = options
    this.#registry = new TextMateRegistryImpl({
      loadGrammar: (scopeName) => this.fetchGrammar(scopeName as ScopeName),
    })
  }

  fetchGrammar = async (
    scopeName: ScopeName
  ): Promise<GrammarMetadata | null> => {
    const source = await this.#options.getGrammar(scopeName)
    if (!source) {
      return null
    }
    return source
  }

  async loadGrammar(language: Languages): Promise<TextMateGrammar | null> {
    let scopeName = Object.keys(grammars).find((scopeName) =>
      (grammars[scopeName as ScopeName] as readonly Languages[]).includes(
        language
      )
    ) as ScopeName | undefined

    if (!scopeName) {
      throw new Error(
        `[renoun] The grammar for language "${language}" could not be found. Ensure this language is included in the \`languages\` prop on \`RootProvider\`.`
      )
    }

    return this.#registry.loadGrammar(scopeName)
  }

  async fetchTheme(name: Theme): Promise<TextMateThemeRaw> {
    const source = await this.#options.getTheme(name)

    if (!source) {
      throw new Error(
        `[renoun] Missing "${name}" theme in Registry. Ensure this theme is configured on \`RootProvider\` and the \`tm-themes\` package is installed.`
      )
    }

    return source
  }

  setTheme(theme: TextMateThemeRaw): void {
    if (this.#theme === theme) return
    this.#theme = theme
    this.#registry.setTheme(theme)
  }

  getThemeColors(): string[] {
    return this.#registry.getColorMap()
  }
}

export class Tokenizer<Theme extends string> {
  #baseColors: Map<string, string> = new Map()
  #registries: Map<string, Registry<Theme>> = new Map()
  #registryOptions: RegistryOptions<Theme>
  #grammarState: GrammarState = []

  constructor(registryOptions: RegistryOptions<Theme>) {
    this.#registryOptions = registryOptions
  }

  /**
   * Ensure a theme is loaded and registered so color map/base color are available.
   */
  async ensureTheme(themeName: Theme): Promise<void> {
    let registry = this.#registries.get(themeName)
    if (!registry) {
      registry = new Registry(this.#registryOptions)
      const theme = await registry.fetchTheme(themeName)
      registry.setTheme(theme)
      if (theme.colors?.['foreground']) {
        this.#baseColors.set(themeName, theme.colors['foreground'])
      }
      this.#registries.set(themeName, registry)
    }
  }

  /**
   * Get context (colorMap, baseColor) for decoding raw tokens from a theme.
   */
  async getContext(theme: Theme): Promise<TokenizerContext> {
    let registry = this.#registries.get(theme)
    if (!registry) {
      registry = new Registry(this.#registryOptions)
      const themeData = await registry.fetchTheme(theme)
      registry.setTheme(themeData)
      if (themeData.colors?.['foreground']) {
        this.#baseColors.set(theme, themeData.colors['foreground'])
      }
      this.#registries.set(theme, registry)
    }
    const colorMap = registry.getThemeColors()
    const baseColor = this.#baseColors.get(theme) || ''
    return { colorMap, baseColor }
  }

  /**
   * Tokenize a single line and return raw tokens.
   */
  async tokenizeLineRaw(
    grammar: TextMateGrammar,
    lineText: string,
    prevState: StateStack,
    timeLimit?: number
  ): Promise<RawTokenizeResult> {
    const lineResult = grammar.tokenizeLine(lineText, prevState, timeLimit ?? 0)
    return {
      tokens: lineResult.tokens as Uint32Array,
      lineText,
      ruleStack: lineResult.ruleStack,
      stoppedEarly: lineResult.stoppedEarly,
    }
  }

  /**
   * Stream raw tokens line-by-line for the given source.
   * Useful for binary RPC transport.
   */
  async *streamRaw(
    source: string,
    language: Languages,
    theme: Theme,
    options?: TokenizeOptions
  ): AsyncGenerator<RawTokenizeResult> {
    const { grammarStates, timeLimit } = normalizeTokenizeOptions(
      [theme],
      options
    )
    const lines = source.split(/\r?\n/)

    let registry = this.#registries.get(theme)
    if (!registry) {
      registry = new Registry(this.#registryOptions)
      const themeData = await registry.fetchTheme(theme)
      registry.setTheme(themeData)
      if (themeData.colors?.['foreground']) {
        this.#baseColors.set(theme, themeData.colors['foreground'])
      }
      this.#registries.set(theme, registry)
    }

    const grammar = await registry.loadGrammar(language)
    if (!grammar) {
      throw new Error(
        `[renoun] Could not load grammar for language: ${language}`
      )
    }

    let state: StateStack = grammarStates?.[0] ?? INITIAL

    for (const lineText of lines) {
      const lineResult = grammar.tokenizeLine(lineText, state, timeLimit ?? 0)
      state = lineResult.ruleStack
      this.#grammarState = [state]
      yield {
        tokens: lineResult.tokens as Uint32Array,
        lineText,
        ruleStack: lineResult.ruleStack,
        stoppedEarly: lineResult.stoppedEarly,
      }
    }
  }

  /**
   * Returns the last grammar states per theme from the most recent
   * `tokenize`/`stream` call. The array indexes correspond to the `themes`
   * array passed into that call.
   */
  getGrammarState(): GrammarState {
    return this.#grammarState.slice()
  }

  /**
   * Retrieve the active color map for a theme if it has been initialized.
   */
  getColorMap(theme: Theme): string[] {
    const registry = this.#registries.get(theme)
    return registry ? registry.getThemeColors() : []
  }

  /**
   * Retrieve the base foreground color for a theme if it has been initialized.
   */
  getBaseColor(theme: Theme): string | undefined {
    return this.#baseColors.get(theme)
  }
}

function normalizeTokenizeOptions<Theme extends string>(
  themes: Theme[],
  options?: TokenizeOptions
): { grammarStates?: GrammarState; timeLimit?: number } {
  if (options === undefined) {
    return { grammarStates: undefined, timeLimit: undefined }
  }

  const { grammarState, timeLimit } = options

  if (grammarState === undefined) {
    return { grammarStates: undefined, timeLimit }
  }

  if (Array.isArray(grammarState)) {
    const grammarStates = themes.map(
      (_, index) => grammarState[index] ?? INITIAL
    )
    return { grammarStates, timeLimit }
  }

  return { grammarStates: themes.map(() => grammarState), timeLimit }
}
