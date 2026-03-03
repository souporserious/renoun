import { describe, expect, test } from 'vitest'

import { resolveBrowserWebSocketUrl } from './browser-websocket-url.ts'

describe('resolveBrowserWebSocketUrl', () => {
  test('uses the page hostname for non-local browser origins', () => {
    expect(
      resolveBrowserWebSocketUrl('43123', {
        protocol: 'https:',
        hostname: 'preview.example.dev',
      })
    ).toBe('wss://preview.example.dev:43123')
  })

  test('falls back to ws when the page is not served over https', () => {
    expect(
      resolveBrowserWebSocketUrl('43123', {
        protocol: 'http:',
        hostname: 'localhost',
      })
    ).toBe('ws://localhost:43123')
  })

  test('wraps IPv6 hosts when constructing the socket URL', () => {
    expect(
      resolveBrowserWebSocketUrl('43123', {
        protocol: 'https:',
        hostname: '::1',
      })
    ).toBe('wss://[::1]:43123')
  })

  test('defaults to localhost when hostname is missing', () => {
    expect(
      resolveBrowserWebSocketUrl('43123', {
        protocol: 'https:',
      })
    ).toBe('wss://localhost:43123')
  })
})
