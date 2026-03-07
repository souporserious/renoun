import { describe, expect, test } from 'vitest'

import { resolveBrowserWebSocketUrl } from './browser-websocket-url.ts'

describe('resolveBrowserWebSocketUrl', () => {
  test('always targets the loopback rpc server', () => {
    expect(
      resolveBrowserWebSocketUrl('43123', {
        protocol: 'https:',
        hostname: 'preview.example.dev',
      })
    ).toBe('ws://localhost:43123')
  })

  test('does not upgrade to wss on https localhost pages', () => {
    expect(
      resolveBrowserWebSocketUrl('43123', {
        protocol: 'https:',
        hostname: 'localhost',
      })
    ).toBe('ws://localhost:43123')
  })

  test('ignores non-local browser hosts until the server exports one', () => {
    expect(
      resolveBrowserWebSocketUrl('43123', {
        protocol: 'https:',
        hostname: '192.168.1.40',
      })
    ).toBe('ws://localhost:43123')
  })

  test('keeps using localhost when the browser host is loopback ipv6', () => {
    expect(
      resolveBrowserWebSocketUrl('43123', {
        protocol: 'https:',
        hostname: '::1',
      })
    ).toBe('ws://localhost:43123')
  })

  test('defaults to localhost when hostname is missing', () => {
    expect(
      resolveBrowserWebSocketUrl('43123', {
        protocol: 'https:',
      })
    ).toBe('ws://localhost:43123')
  })
})
