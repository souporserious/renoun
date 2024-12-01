import { describe, test, expect } from 'vitest'

import { FileName } from './FileName'

describe('FileName', () => {
  test('parses full filename', () => {
    const file = new FileName('02.generics.exercise.ts')

    expect(file.getOrder()).toBe('02')
    expect(file.getBaseName()).toBe('generics')
    expect(file.getModifier()).toBe('exercise')
    expect(file.getExtension()).toBe('ts')
  })

  test('without order', () => {
    const file = new FileName('test.file.txt')

    expect(file.getOrder()).toBeUndefined()
    expect(file.getBaseName()).toBe('test')
    expect(file.getModifier()).toBe('file')
    expect(file.getExtension()).toBe('txt')
  })

  test('without modifier', () => {
    const file = new FileName('1-foo.txt')

    expect(file.getOrder()).toBe('1')
    expect(file.getBaseName()).toBe('foo')
    expect(file.getModifier()).toBeUndefined()
    expect(file.getExtension()).toBe('txt')
  })

  test('handles filenames with only base', () => {
    const file = new FileName('foo')

    expect(file.getOrder()).toBeUndefined()
    expect(file.getName()).toBe('foo')
    expect(file.getBaseName()).toBe('foo')
    expect(file.getModifier()).toBeUndefined()
    expect(file.getExtension()).toBeUndefined()
  })

  test('returns original name', () => {
    const file = new FileName('01.beep.boop.bop')
    expect(file.getName()).toBe('01.beep.boop.bop')
  })
})
