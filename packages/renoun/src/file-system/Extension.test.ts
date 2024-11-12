import { describe, it, expect } from 'vitest'

import { Extension } from './Extension'

describe('Extension', () => {
  it('creates a simple instance', () => {
    const mdx = new Extension('mdx')
    expect(mdx.extension).toBe('mdx')
  })

  it('does not require schema', () => {
    const ts = new Extension('ts').withSchema<{ default: Function }>()
    expect(ts.extension).toBe('ts')
  })

  it('returns the correct schema function when it exists', () => {
    const mdx = new Extension('mdx').withSchema<{
      default: Function
      metadata: { title: string; description?: string }
    }>({
      metadata: (value) => {
        if (value.title === '') {
          throw new Error('Title is required')
        }
        return value
      },
    })
    const metadataSchema = mdx.getSchema('metadata')

    expect(metadataSchema).toBeInstanceOf(Function)

    expect(
      metadataSchema!({
        title: 'Hello',
        description: 'Brave new world',
      })
    ).toEqual({ title: 'Hello', description: 'Brave new world' })

    expect(() => metadataSchema!({ title: '' })).toThrow('Title is required')
  })

  it('returns null for undefined schema entries', () => {
    const mdx = new Extension('mdx').withSchema<{
      default: Function
      metadata: { title: string; description: string }
    }>({
      metadata: (value) => value,
    })

    expect(mdx.getSchema('default')).toBeNull()
  })

  it('throws type error when accessing schema key that does not exist', () => {
    const mdx = new Extension('mdx').withSchema<{
      metadata: { title: string; description: string }
    }>({
      metadata: (value) => value,
    })

    // @ts-expect-error
    mdx.getSchema('default')
  })
})
