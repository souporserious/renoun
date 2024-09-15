/** Splits a token based on non-overlapping ranges. */
export function splitTokenByRanges<
  Token extends { value: string; start: number; end: number },
>(token: Token, globalRanges: { start: number; end: number }[]): Token[] {
  let currentPosition = 0
  let splitTokens: Token[] = []
  let tokenGlobalStart = token.start

  // Adjust ranges to token range
  let localRanges = globalRanges
    .map((range) => ({
      start: range.start - tokenGlobalStart,
      end: range.end - tokenGlobalStart,
    }))
    // Only include ranges that overlap with the token
    .filter((range) => range.start < token.value.length && range.end > 0)

  localRanges.forEach((range) => {
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
  })

  if (currentPosition < token.value.length) {
    splitTokens.push({
      ...token,
      value: token.value.slice(currentPosition),
      start: tokenGlobalStart + currentPosition,
      end: tokenGlobalStart + token.value.length,
    })
  }

  return splitTokens
}
