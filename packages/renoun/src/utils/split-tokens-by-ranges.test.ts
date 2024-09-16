import { describe, test, expect } from 'vitest'

import { splitTokenByRanges } from './split-tokens-by-ranges.js'

describe('splitTokenByRanges', () => {
  test('multiple symbols in a token', () => {
    const token = {
      value: '{ CodeBlock, Toolbar, Tokens }',
      start: 0,
      end: 30,
      isSymbol: false,
    }
    const ranges = [
      { start: 2, end: 11 },
      { start: 13, end: 20 },
      { start: 22, end: 28 },
    ]
    const result = splitTokenByRanges(token, ranges)
    expect(result.length).toBe(7)
    expect(result[0].value).toBe('{ ')
    expect(result[0].isSymbol).toBeFalsy()
    expect(result[1].value).toBe('CodeBlock')
    expect(result[1].isSymbol).toBeTruthy()
    expect(result[2].value).toBe(', ')
    expect(result[2].isSymbol).toBeFalsy()
    expect(result[3].value).toBe('Toolbar')
    expect(result[3].isSymbol).toBeTruthy()
    expect(result[4].value).toBe(', ')
    expect(result[4].isSymbol).toBeFalsy()
    expect(result[5].value).toBe('Tokens')
    expect(result[5].isSymbol).toBeTruthy()
    expect(result[6].value).toBe(' }')
  })
})
