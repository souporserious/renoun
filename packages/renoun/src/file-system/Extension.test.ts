import { describe, it, expect } from 'vitest'

import { Extension } from './Extension'

describe('Extension', () => {
  it('should return the correct schema function when it exists', () => {
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

  it('should return null for undefined schema entries', () => {
    const mdx = new Extension('mdx').withSchema<{
      default: Function
      metadata: { title: string; description: string }
    }>({
      metadata: (value) => value,
    })

    expect(mdx.getSchema('default')).toBeNull()
  })

  it('should throw TypeScript error when accessing undefined schema key', () => {
    const mdx = new Extension('mdx').withSchema<{
      metadata: { title: string; description: string }
    }>({
      metadata: (value) => value,
    })

    // @ts-expect-error
    mdx.getSchema('default')
  })
})
