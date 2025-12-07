import { describe, expect, test } from 'vitest'
import { compile } from '@mdx-js/mdx'

import remarkTypography from './typography'

async function compileWithPlugin(value: string) {
  return String(
    await compile(value, {
      remarkPlugins: [remarkTypography],
      development: true,
    })
  )
}

describe('remarkTypography', () => {
  test('applies smart punctuation', async () => {
    const result = await compileWithPlugin(
      '"Hello, world" -- said the author... and then paused.'
    )

    expect(result).toContain(
      '“Hello, world” — said the author… and then paused.'
    )
  })

  test('handles punctuation across nodes', async () => {
    const result = await compileWithPlugin(
      '"Hello, **world**" and a link to [site](https://example.com).'
    )

    expect(result).toContain('“Hello, ')
    expect(result).toContain(
      'children: ["“Hello, ", _jsxDEV(_components.strong, {'
    )
    expect(result).toContain('” and a link to')
  })

  test('preserves inline code', async () => {
    const result = await compileWithPlugin('"Hello" `--` ... "code"')

    expect(result).toContain('“Hello” ')
    expect(result).toContain('children: "--"')
    expect(result).toContain(' … “code”')
  })

  test('handles multiple paragraphs', async () => {
    const result = await compileWithPlugin(
      '"First paragraph."\n\n"Second paragraph with **bold** text."'
    )

    expect(result).toContain('“First paragraph.”')
    expect(result).toContain('“Second paragraph with ')
    expect(result).toContain('text.”')
  })

  test('ignores typography inside style and script blocks', async () => {
    const result = await compileWithPlugin(
      '<style>"Raw style"</style>\n\n<script>"Raw script"</script>\n\n"Outside"'
    )

    // Inside ignored elements the straight quotes should remain.
    // MDX escapes the inner quotes in the compiled output.
    expect(result).toContain('children: "\\"Raw style\\""')
    expect(result).toContain('children: "\\"Raw script\\""')
    expect(result).not.toContain('“Raw style”')
    expect(result).not.toContain('“Raw script”')

    // Outside, typography should be applied.
    expect(result).toContain('“Outside”')
  })

  test('treats double quotes after a word as opening when starting a new phrase', async () => {
    const result = await compileWithPlugin('He said "Hi!" This is "quoted".')

    expect(result).toContain('He said “Hi!” This is “quoted”.')
  })

  test('handles single-quoted phrases after verbs and in lists', async () => {
    const result = await compileWithPlugin(
      "He said 'hello.' She wrote 'a', 'b', and 'c'."
    )

    expect(result).toContain('He said ‘hello.’ She wrote ‘a’, ‘b’, and ‘c’.')
  })

  test('treats leading apostrophes and decades as apostrophes', async () => {
    const result = await compileWithPlugin(
      "'Twas the night, 'tis the season, and '90s kids."
    )

    expect(result).toContain('’Twas the night, ’tis the season, and ’90s kids.')
  })

  test('handles empty double quotes as an opening–closing pair', async () => {
    const result = await compileWithPlugin('"" and "foo" ""')

    expect(result).toContain('“” and “foo” “”')
  })

  test('handles no-space style before opening quotes', async () => {
    const result = await compileWithPlugin('He said,"Hello."')

    expect(result).toContain('He said,“Hello.”')
  })

  test('handles single-quoted phrases with internal punctuation', async () => {
    const result = await compileWithPlugin("He said 'hello, world'.")

    expect(result).toContain('He said ’hello, world’.')
  })

  test('ignores typography inside code and pre blocks (inline and flow)', async () => {
    const result = await compileWithPlugin(
      '<code>"Raw code"</code>\n\n<pre>"Raw pre"</pre>\n\n"Outside"'
    )

    // Inside ignored elements the straight quotes should remain.
    // MDX escapes the inner quotes in the compiled output.
    expect(result).toContain('children: "\\"Raw code\\""')
    expect(result).toContain('children: "\\"Raw pre\\""')
    expect(result).not.toContain('“Raw code”')
    expect(result).not.toContain('“Raw pre”')

    // Outside, typography should be applied.
    expect(result).toContain('“Outside”')
  })
})
