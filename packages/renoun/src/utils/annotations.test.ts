import { describe, expect, test } from 'vitest'

import { parseAnnotations, remapAnnotationInstructions } from './annotations.js'

describe('parseAnnotations', () => {
  test('extracts inline annotations and removes sigils', () => {
    const source = 'console./*highlight color=\'yellow\'**/ log("x")'
    const result = parseAnnotations(source, ['highlight'])

    expect(result.value).toBe('console. log("x")')
    expect(result.inline).toHaveLength(1)
    expect(result.inline[0]).toMatchObject({
      tag: 'highlight',
      props: { color: 'yellow' },
      index: 'console.'.length,
    })
    expect(result.block).toHaveLength(0)
  })

  test('extracts block annotations and removes decorated lines', () => {
    const source = [
      'function sum(a, b) {',
      '  /*note title="add"*/',
      '  return a + b;',
      '  /**note*/',
      '}',
      '',
    ].join('\n')

    const result = parseAnnotations(source, ['note'])

    expect(result.value).not.toContain('/*note')
    expect(result.value).not.toContain('/**note')
    expect(result.block).toHaveLength(1)

    const [instruction] = result.block
    expect(result.value.slice(instruction.start, instruction.end)).toBe(
      '  return a + b;\n'
    )
  })
})

describe('remapAnnotationInstructions', () => {
  test('repositions inline annotations after formatting', () => {
    const source = 'console./*highlight color=\'yellow\'**/ log("x")'
    const parsed = parseAnnotations(source, ['highlight'])

    const remapped = remapAnnotationInstructions(
      { block: parsed.block, inline: parsed.inline },
      parsed.value,
      'console.log("x")'
    )
    console.log(remapped)

    expect(remapped.inline).toHaveLength(1)
    expect(remapped.inline[0].index).toBe('console.'.length)
  })

  test('repositions block annotations after formatting changes whitespace', () => {
    const source = 'const value = { /*note*/a:1/**note*/ }'
    const parsed = parseAnnotations(source, ['note'])

    const formatted = 'const value = { a: 1 }'
    const remapped = remapAnnotationInstructions(
      { block: parsed.block, inline: parsed.inline },
      parsed.value,
      formatted
    )

    expect(remapped.block).toHaveLength(1)
    const [instruction] = remapped.block
    expect(formatted.slice(instruction.start, instruction.end)).toBe('a: 1')
  })
})

describe('rgba prop parsing', () => {
  test('parses quoted rgba string value in block annotation', () => {
    const source = `const a = /*highlight color='rgba(255, 255, 0, 0.5)' */1/**highlight*/`
    const result = parseAnnotations(source, ['highlight'])
    expect(result.block).toHaveLength(1)
    const [instruction] = result.block
    expect(instruction).toMatchObject({
      tag: 'highlight',
      props: { color: 'rgba(255, 255, 0, 0.5)' },
    })
    expect(result.value.slice(instruction.start, instruction.end)).toBe('1')
  })
})
