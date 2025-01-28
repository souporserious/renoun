import { describe, test, expect } from 'vitest'

import { createCloneConfig } from './index'
import path from 'path'

describe('git config', () => {
  test('get clone config - only repository is specified', () => {
    const config = createCloneConfig({
      repository: 'https://github.com/souporserious/renoun',
    })

    expect(config.corsProxy).toBeUndefined()
    expect(config.url).toEqual('https://github.com/souporserious/renoun')
    expect(config.dir).toEqual(path.join(process.cwd(), '.renoun', 'cache', 'git'))
    expect(config.onAuth).toBeUndefined()
  })

  test('get clone config - w/ custom cache dir', () => {
    const config = createCloneConfig({
      repository: 'https://github.com/souporserious/renoun',
      cacheDirectory: '/tmp'
    })

    expect(config.corsProxy).toBeUndefined()
    expect(config.url).toEqual('https://github.com/souporserious/renoun')
    expect(config.dir).toEqual('/tmp')
    expect(config.onAuth).toBeUndefined()
  })

  test('get clone config - w/ proxy', () => {
    const config = createCloneConfig({
      repository: 'https://github.com/souporserious/renoun',
      proxy: 'http://localhost:8157'
    })

    expect(config.corsProxy).toEqual('http://localhost:8157')
    expect(config.url).toEqual('https://github.com/souporserious/renoun')
    expect(config.dir).toEqual(path.join(process.cwd(), '.renoun', 'cache', 'git'))
    expect(config.onAuth).toBeUndefined()
  })

  test('get clone config - w/ credentials', () => {
    const config = createCloneConfig({
      repository: 'https://github.com/souporserious/renoun',
      credentials: {
        username: 'XXXX',
        token: 'XXXX'
      }
    })

    expect(config.corsProxy).toBeUndefined()
    expect(config.url).toEqual('https://github.com/souporserious/renoun')
    expect(config.dir).toEqual(path.join(process.cwd(), '.renoun', 'cache', 'git'))
    expect(config.onAuth).toBeDefined()
    // @ts-expect-error could be undefined, but it isn't :D
    expect(config.onAuth("",{})).toEqual({
      username: 'XXXX',
      password: 'XXXX'
    })
  })
})
