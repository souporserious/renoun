import { describe, it, expect } from 'vitest'

import { parseJsonWithComments } from './parse-json-with-comments'

describe('parseJsonWithComments', () => {
  it('strips line comments', () => {
    const input = `{ "a": "1" // comment\n}`
    expect(parseJsonWithComments(input)).toEqual({ a: '1' })
  })

  it('strips block comments', () => {
    const input = `{ "a": 1, /* inner */ "b": 2 }`
    expect(parseJsonWithComments(input)).toEqual({ a: 1, b: 2 })
  })

  it('keeps newline after // comment (preserves line numbers)', () => {
    const input = `{\n  "a": 1, // comment\r\n  "b": 2\n}`
    expect(parseJsonWithComments(input)).toEqual({ a: 1, b: 2 })
  })

  it('ignores comment-like text inside strings', () => {
    const input = `{ "url": "http://example.com/*doc*/?q=1", "note": "// not a comment" }`
    expect(parseJsonWithComments(input)).toEqual({
      url: 'http://example.com/*doc*/?q=1',
      note: '// not a comment',
    })
  })

  it('handles escaped quotes in strings', () => {
    const input = `{ "a": "foo \\"bar\\" baz" /* cmt */ }`
    expect(parseJsonWithComments(input)).toEqual({ a: 'foo "bar" baz' })
  })

  it('throws on unterminated block comment', () => {
    const input = '{ "a": 1 /* never closes'
    expect(() => parseJsonWithComments(input)).toThrow(
      /Unterminated block comment/i
    )
  })

  it('throws on unterminated string literal', () => {
    const input = '{ "a": "oops }'
    expect(() => parseJsonWithComments(input)).toThrow(
      /Unterminated string literal/i
    )
  })

  it('fails on trailing commas', () => {
    const input = '{ "a": 1, }'
    expect(() => parseJsonWithComments(input)).toThrow(SyntaxError)
  })

  it('fails on single-quoted strings', () => {
    const input = "{ 'a': 1 }"
    expect(() => parseJsonWithComments(input)).toThrow(SyntaxError)
  })
})
