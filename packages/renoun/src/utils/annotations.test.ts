import { describe, expect, test } from 'vitest'

import {
  hasAnnotationCandidates,
  parseAnnotations,
  remapAnnotationInstructions,
} from './annotations.ts'

describe('hasAnnotationCandidates', () => {
  test.concurrent('returns false when source lacks matching comment markers', () => {
    const source = ['const value = 1', '/* not an annotation */'].join('\n')
    expect(hasAnnotationCandidates(source, ['highlight'])).toBe(false)
  })

  test.concurrent('returns true when at least one annotation tag is present', () => {
    const source = "console./*highlight*/log('hi')/**highlight*/"
    expect(hasAnnotationCandidates(source, ['highlight'])).toBe(true)
  })
})

describe('parseAnnotations', () => {
  test.concurrent('extracts inline annotations and removes annotations', () => {
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

  test.concurrent('extracts block annotations and removes decorated lines', () => {
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
  test.concurrent('repositions inline annotations after formatting', () => {
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

  test.concurrent('repositions block annotations after formatting changes whitespace', () => {
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

  test.concurrent('parses quoted rgba string value in block annotation', () => {
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

  test.concurrent('requires "/**tag*/" to close a block, not "/*tag*/"', () => {
    const wrong = '/*warn*/[]/*warn*/'
    expect(() => parseAnnotations(wrong, ['warn'])).toThrowError(
      /Unclosed annotation/i
    )

    const correct = '/*warn*/[]/**warn*/'
    const correctParsed = parseAnnotations(correct, ['warn'])
    expect(correctParsed.block).toHaveLength(1)
    const [instruction] = correctParsed.block
    expect(correctParsed.value.slice(instruction.start, instruction.end)).toBe(
      '[]'
    )
  })

  test.concurrent('supports nested blocks', () => {
    const source = [
      '/*a*/',
      'one',
      '/*b*/',
      'two',
      '/**b*/',
      'three',
      '/**a*/',
    ].join('\n')
    const result = parseAnnotations(source, ['a', 'b'])
    expect(result.value).toBe(['one', 'two', 'three'].join('\n'))
    const tags = result.block.map((b) => b.tag)
    expect(tags).toContain('a')
    expect(tags).toContain('b')
  })

  test.concurrent('handles consecutive lines with inline selections', () => {
    const source = [
      "console./*highlight color='rgba(255,213,0,0.35)'*/warn/**highlight*/('Warning')",
      "console./*highlight color='rgba(255,0,0,0.35)'*/log/**highlight*/('Error')",
    ].join('\n')
    const result = parseAnnotations(source, ['highlight'])
    expect(result.value).toBe(
      ["console.warn('Warning')", "console.log('Error')"].join('\n')
    )
    expect(result.block).toHaveLength(2)
    expect(result.block[0]!.tag).toBe('highlight')
    expect(result.block[1]!.tag).toBe('highlight')
  })

  test.concurrent('precisely captures selection boundaries on a single line', () => {
    const source = 'console.log(/*hi*/level/**hi*/)'
    const result = parseAnnotations(source, ['hi'])
    expect(result.value).toBe('console.log(level)')
    expect(result.block).toHaveLength(1)
    const [instruction] = result.block
    const selected = result.value.slice(instruction.start, instruction.end)
    expect(selected).toBe('level')
  })

  test.concurrent('parses self-closing inline annotations and keeps position', () => {
    const source = "console./*hi**/warn('Warning')"
    const result = parseAnnotations(source, ['hi'])
    expect(result.value).toBe("console.warn('Warning')")
    expect(result.inline).toHaveLength(1)
    expect(result.inline[0]!.tag).toBe('hi')
    expect(result.inline[0]!.index).toBe('console.'.length)
  })

  test.concurrent('parses self-closing inline annotations with props', () => {
    const source = "console./*hi color='yellow' **/log('Error')"
    const result = parseAnnotations(source, ['hi'])
    expect(result.value).toBe("console.log('Error')")
    expect(result.inline).toHaveLength(1)
    expect(result.inline[0]!.props).toEqual({ color: 'yellow' })
  })

  test.concurrent('remaps block selection for bracket-only targets to non-empty range', () => {
    const source = 'useEffect(() => {}, /*warn*/[]/**warn*/)' // select []
    const parsed = parseAnnotations(source, ['warn'])
    expect(parsed.block).toHaveLength(1)
    const [instruction] = parsed.block
    const originalSelected = parsed.value.slice(
      instruction.start,
      instruction.end
    )
    expect(originalSelected).toBe('[]')

    // Simulate formatting that could collapse indices
    const formatted = 'useEffect(() => {}, [])'
    const remapped = remapAnnotationInstructions(
      { block: parsed.block, inline: parsed.inline },
      parsed.value,
      formatted
    )
    const [remappedInstruction] = remapped.block
    const remappedSelected = formatted.slice(
      remappedInstruction.start,
      remappedInstruction.end
    )
    expect(remappedSelected.length).toBeGreaterThan(0)
  })
})
