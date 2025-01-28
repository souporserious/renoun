import { describe, test, expect } from 'vitest'

import { createCheckoutConfig, createCloneConfig, loadContent } from './index'
import path from 'path'

describe('git filesystem - config', () => {
  describe('clone config', () => {
    test('w/ defaults', () => {
      const config = createCloneConfig({
        repository: 'https://github.com/souporserious/renoun',
      })

      expect(config.corsProxy).toBeUndefined()
      expect(config.url).toEqual('https://github.com/souporserious/renoun')
      expect(config.dir).toEqual(
        path.join(
          process.cwd(),
          '.renoun',
          'cache',
          'git-file-system',
          'b9316d301e274ff6190f743be1c43aacbb5b7e0b25f7494bbff9beaec38bf522'
        )
      )
      expect(config.onAuth).toBeUndefined()
    })

    test('w/ custom cache dir', () => {
      const config = createCloneConfig({
        repository: 'https://github.com/souporserious/renoun',
        cacheDirectory: '/tmp',
      })

      expect(config.dir).toEqual('/tmp')
    })

    test('w/ proxy', () => {
      const config = createCloneConfig({
        repository: 'https://github.com/souporserious/renoun',
        proxy: 'http://localhost:8157',
      })

      expect(config.corsProxy).toEqual('http://localhost:8157')
    })

    test('w/ credentials', () => {
      const config = createCloneConfig({
        repository: 'https://github.com/souporserious/renoun',
        credentials: {
          username: 'XXXX',
          token: 'XXXX',
        },
      })

      expect(config.onAuth).toBeDefined()
      // @ts-expect-error could be undefined, but it isn't :D
      expect(config.onAuth('', {})).toEqual({
        username: 'XXXX',
        password: 'XXXX',
      })
    })

    test('w/ branch', () => {
      const config = createCloneConfig({
        repository: 'https://github.com/souporserious/renoun',
        branch: 'custom-branch',
      })

      expect(config.ref).toEqual('custom-branch')
    })
  })

  describe('checkout config', () => {
    test('w/ defaults', () => {
      const config = createCheckoutConfig({
        repository: 'https://github.com/souporserious/renoun',
      })

      expect(config.dir).toEqual(
        path.join(
          process.cwd(),
          '.renoun',
          'cache',
          'git-file-system',
          'b9316d301e274ff6190f743be1c43aacbb5b7e0b25f7494bbff9beaec38bf522'
        )
      )
    })

    test('w/ custom cache dir', () => {
      const config = createCheckoutConfig({
        repository: 'https://github.com/souporserious/renoun',
        cacheDirectory: '/tmp',
      })

      expect(config.dir).toEqual('/tmp')
    })

    test('w/ custom include', () => {
      const config = createCheckoutConfig({
        repository: 'https://github.com/souporserious/renoun',
        include: ['content'],
      })

      expect(config.filepaths).toEqual(['content'])
    })

    test('w/ custom branch', () => {
      const config = createCheckoutConfig({
        repository: 'https://github.com/souporserious/renoun',
        branch: 'custom-branch',
      })

      expect(config.ref).toEqual('custom-branch')
    })
  })
})

// TODO: currently we're generating files in the local fs
//       maybe we should mock it? https://vitest.dev/guide/mocking#file-system
describe('git filesystem - loader', () => {
  test('loadContent', async () => {
    const result = await loadContent({
      repository: 'https://github.com/noxify/renoun-docs-template',
      include: ['content/posts'],
    })

    expect([...result.getFiles().keys()]).toEqual([
      './content/posts/build-a-button-component-in-react.mdx',
    ])
  })
})
