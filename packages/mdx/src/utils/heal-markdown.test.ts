import { describe, expect, test } from 'vitest'

import { healMarkdown } from './heal-markdown.js'

describe('healMarkdown', () => {
  test('returns original input when there are no special markers', () => {
    const source = 'Just some plain text with no markdown markers.'
    expect(healMarkdown(source)).toBe(source)
  })

  test('returns empty string when input is empty', () => {
    expect(healMarkdown('')).toBe('')
  })

  test('completes an incomplete link at the end of the input', () => {
    const source = 'Read more [docs](/getting-started'
    const result = healMarkdown(source)

    expect(result).toBe('Read more [docs](streamdown:incomplete-link)')
  })

  test('drops an incomplete image at the end of the input while preserving prefix text', () => {
    const source = 'Logo: ![Alt text](/images/logo'
    const result = healMarkdown(source)

    expect(result).toBe('Logo: ')
  })

  test('closes unbalanced inline code at the tail', () => {
    expect(healMarkdown('`code')).toBe('`code`')
    expect(healMarkdown('`already closed`')).toBe('`already closed`')
  })

  test('closes unbalanced block math at the tail', () => {
    const source = '$$ a + b'
    const result = healMarkdown(source)

    expect(result).toBe('$$ a + b$$')
  })

  test('closes unbalanced inline math delimiters', () => {
    const parenSource = 'Inline math: \\(a + b'
    const parenResult = healMarkdown(parenSource)
    expect(parenResult).toBe('Inline math: \\(a + b\\)')

    const bracketSource = 'Matrix: \\[1, 2; 3, 4'
    const bracketResult = healMarkdown(bracketSource)
    expect(bracketResult).toBe('Matrix: \\[1, 2; 3, 4\\]')
  })

  test('closes multiple nested inline math delimiters in LIFO order', () => {
    const source = 'Mixed: \\(x + y\\['
    const result = healMarkdown(source)

    // First close bracket, then paren.
    expect(result).toBe('Mixed: \\(x + y\\[\\]\\)')
  })

  test('closes unmatched emphasis markers on the last line only', () => {
    const source = 'Line 1 *foo\nLine 2 *bar'
    const result = healMarkdown(source)

    expect(result).toBe('Line 1 *foo\nLine 2 *bar*')
  })

  test('does not treat list item markers as emphasis', () => {
    const source = '* item one\n* item two'
    const result = healMarkdown(source)

    expect(result).toBe(source)
  })

  test('does not treat word_internal_underscores as emphasis', () => {
    const source = 'variable_name and FOO_BAR should not be emphasis'
    const result = healMarkdown(source)

    expect(result).toBe(source)
  })

  test('closes unmatched underscore emphasis when not inside a word', () => {
    const source = 'This is _emphasis'
    const result = healMarkdown(source)

    expect(result).toBe('This is _emphasis_')
  })

  test('closes unmatched strikethrough markers', () => {
    const source = '~~pending'
    const result = healMarkdown(source)

    expect(result).toBe('~~pending~~')
  })

  test('heals a trailing unclosed single dollar math expression', () => {
    // Basic heuristic: incomplete math at end of string
    const input = 'The formula is $E = mc^2'
    const expected = 'The formula is $E = mc^2$'
    expect(healMarkdown(input)).toBe(expected)
  })

  test('heals a single dollar math expression with whitespace', () => {
    const input = 'Here is $ a + b'
    const expected = 'Here is $ a + b$'
    expect(healMarkdown(input)).toBe(expected)
  })

  test('does not modify an already closed single dollar expression', () => {
    const input = 'The value is $x=5$. Next sentence.'
    expect(healMarkdown(input)).toBe(input)
  })

  test('ignores escaped dollars (\\$)', () => {
    // If the dollar is escaped, it is text, not a math opener.
    // Therefore, no closing $ should be appended.
    const input = 'The cost is \\$50 and that is cheap.'
    expect(healMarkdown(input)).toBe(input)
  })

  test('ignores dollars inside inline code', () => {
    // The scanner should prioritize code blocks over math
    const input = 'Use the variable `$foo` in bash'
    expect(healMarkdown(input)).toBe(input)
  })

  test('ignores dollars inside code blocks', () => {
    const input = '```\nconst price = $500;\n```'
    expect(healMarkdown(input)).toBe(input)
  })

  test('correctly distinguishes between inline ($) and block ($$)', () => {
    // Ensure the single dollar logic doesn't eagerly grab the first char of $$
    const input = 'Block math: $$x^2'
    const expected = 'Block math: $$x^2$$'
    expect(healMarkdown(input)).toBe(expected)
  })

  test('handles multiple inline math segments correctly', () => {
    const input = 'First $a$, then $b$, finally $c'
    const expected = 'First $a$, then $b$, finally $c$'
    expect(healMarkdown(input)).toBe(expected)
  })

  test('works alongside LaTeX style parens', () => {
    // Ensures the stack can handle different types of math tokens if implemented that way
    const input = 'Standard: \\(x\\), Dollar: $y'
    const expected = 'Standard: \\(x\\), Dollar: $y$'
    expect(healMarkdown(input)).toBe(expected)
  })
})
