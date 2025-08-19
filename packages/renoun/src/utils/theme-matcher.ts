import type { TextMateThemeRaw } from './create-tokenizer.js'

export type ThemeRule = {
  selectorChains: string[][][]
  settings: {
    foreground?: string
    fontStyle?: string
  }
  specificity: number
  order: number
}

export type ThemeCache = {
  rules: ThemeRule[]
  baseColor: string
}

const THEME_CACHE = new WeakMap<TextMateThemeRaw, ThemeCache>()

export function getThemeCache(theme: TextMateThemeRaw): ThemeCache {
  const cached = THEME_CACHE.get(theme)

  if (cached) {
    return cached
  }

  const rules: ThemeRule[] = []
  const tokenColors = theme.tokenColors || []
  let order = 0

  for (const tokenColor of tokenColors) {
    const scopes = tokenColor.scope
      ? Array.isArray(tokenColor.scope)
        ? tokenColor.scope
        : String(tokenColor.scope)
            .split(',')
            .map((scope) => scope.trim())
            .filter(Boolean)
      : []

    if (scopes.length === 0 && !tokenColor.settings) {
      continue
    }

    const selectorChains = scopes.map(parseSelector)
    const specificity = Math.max(0, ...selectorChains.map(scoreSelector))

    rules.push({
      selectorChains,
      settings: {
        foreground: tokenColor.settings?.foreground,
        fontStyle: tokenColor.settings?.fontStyle,
      },
      specificity,
      order: order++,
    })
  }

  const baseColor = (theme.colors?.['foreground'] || '').toLowerCase()
  const cache: ThemeCache = { rules, baseColor }

  THEME_CACHE.set(theme, cache)

  return cache
}

function parseSelector(selector: string): string[][] {
  return selector.split(/\s+/).map((token) => token.split('.').filter(Boolean))
}

function scoreSelector(chains: string[][]): number {
  let specificity = 0
  for (const segments of chains) {
    specificity += segments.length
  }
  return specificity
}

function matchesSelector(scopeStack: string[], chain: string[][]): boolean {
  if (chain.length === 0) {
    return false
  }

  let scopeIndex = 0

  for (let chainIndex = 0; chainIndex < chain.length; chainIndex++) {
    const want = chain[chainIndex]!
    let found = false

    for (; scopeIndex < scopeStack.length; scopeIndex++) {
      const have = scopeStack[scopeIndex]!.split('.')
      if (prefixMatch(have, want)) {
        found = true
        scopeIndex++
        break
      }
    }

    if (!found) {
      return false
    }
  }

  return true
}

function prefixMatch(have: string[], want: string[]): boolean {
  if (want.length > have.length) {
    return false
  }

  for (let wantIndex = 0; wantIndex < want.length; wantIndex++) {
    if (have[wantIndex] !== want[wantIndex]) {
      return false
    }
  }

  return true
}

export function computeStyleForScopes(
  scopes: string[],
  theme: TextMateThemeRaw
): {
  color?: string
  fontStyle?: string
  fontWeight?: string
  textDecoration?: string
} {
  const { rules } = getThemeCache(theme)
  let bestColor: string | undefined
  let bestFontStyle: string | undefined
  let bestSpecificity = -1
  let bestOrder = -1

  for (const rule of rules) {
    let matched = false

    for (const chain of rule.selectorChains) {
      if (matchesSelector(scopes, chain)) {
        matched = true
        break
      }
    }

    if (!matched) {
      continue
    }

    if (
      rule.specificity > bestSpecificity ||
      (rule.specificity === bestSpecificity && rule.order >= bestOrder)
    ) {
      bestSpecificity = rule.specificity
      bestOrder = rule.order
      bestColor = rule.settings.foreground
      bestFontStyle = rule.settings.fontStyle
    }
  }

  let fontStyle: string | undefined
  let fontWeight: string | undefined
  let textDecoration: string | undefined

  if (bestFontStyle) {
    const parts = bestFontStyle.split(/\s+/)
    if (parts.includes('italic')) fontStyle = 'italic'
    if (parts.includes('bold')) fontWeight = 'bold'
    const textDecorations: string[] = []
    if (parts.includes('underline')) textDecorations.push('underline')
    if (parts.includes('strikethrough')) textDecorations.push('line-through')
    if (textDecorations.length) textDecoration = textDecorations.join(' ')
  }

  return {
    color: bestColor,
    fontStyle,
    fontWeight,
    textDecoration,
  }
}
