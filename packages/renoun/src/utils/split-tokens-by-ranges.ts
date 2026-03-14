/** Splits a token based on non-overlapping ranges. */
export function splitTokenByRanges<
  Token extends { value: string; start: number; end: number },
>(token: Token, globalRanges: { start: number; end: number }[]): Token[] {
  let currentPosition = 0
  let splitTokens: Token[] = []
  let tokenGlobalStart = token.start
  const tokenValueLength = token.value.length

  for (const globalRange of globalRanges) {
    const range = {
      start: globalRange.start - tokenGlobalStart,
      end: globalRange.end - tokenGlobalStart,
    }

    if (range.start >= tokenValueLength || range.end <= 0) {
      continue
    }

    if (range.start > currentPosition) {
      splitTokens.push({
        ...token,
        value: token.value.slice(currentPosition, range.start),
        start: tokenGlobalStart + currentPosition,
        end: tokenGlobalStart + range.start,
      })
    }
    if (range.end > currentPosition) {
      splitTokens.push({
        ...token,
        value: token.value.slice(range.start, range.end),
        start: tokenGlobalStart + range.start,
        end: tokenGlobalStart + range.end,
        isSymbol: true,
      })
      currentPosition = range.end
    }
  }

  if (currentPosition < tokenValueLength) {
    splitTokens.push({
      ...token,
      value: token.value.slice(currentPosition),
      start: tokenGlobalStart + currentPosition,
      end: tokenGlobalStart + tokenValueLength,
    })
  }

  return splitTokens
}
