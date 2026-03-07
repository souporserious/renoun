import { describe, expect, test } from 'vitest'

import { resolveBrowserWebSocketUrl } from './browser-websocket-url.ts'

describe('resolveBrowserWebSocketUrl', () => {
  test('uses the exported ipv4 loopback host when provided', () => {
    expect(
      resolveBrowserWebSocketUrl({
        port: '43123',
        host: '127.0.0.1',
      })
    ).toBe('ws://127.0.0.1:43123')
  })

  test('formats exported ipv6 loopback hosts for websocket urls', () => {
    expect(
      resolveBrowserWebSocketUrl({
        port: '43123',
        host: '::1',
      })
    ).toBe('ws://[::1]:43123')
  })

  test('uses the browser loopback host when the runtime does not export one', () => {
    expect(
      resolveBrowserWebSocketUrl(
        {
          port: '43123',
        },
        {
          protocol: 'https:',
          hostname: '127.0.0.1',
        }
      )
    ).toBe('ws://127.0.0.1:43123')
  })

  test('keeps using ws for loopback ipv6 browser hosts', () => {
    expect(
      resolveBrowserWebSocketUrl(
        {
          port: '43123',
        },
        {
          protocol: 'https:',
          hostname: '::1',
        }
      )
    ).toBe('ws://[::1]:43123')
  })

  test('prefers the browser origin for proxied https sessions when runtime only exposes loopback', () => {
    expect(
      resolveBrowserWebSocketUrl(
        {
          port: '43123',
          host: '127.0.0.1',
        },
        {
          protocol: 'https:',
          hostname: 'preview.example.dev',
        }
      )
    ).toBe('wss://preview.example.dev:43123')
  })

  test('falls back to the browser origin when no runtime host is exported', () => {
    expect(
      resolveBrowserWebSocketUrl(
        {
          port: '43123',
        },
        {
          protocol: 'https:',
          hostname: 'preview.example.dev',
        }
      )
    ).toBe('wss://preview.example.dev:43123')
  })

  test('defaults to localhost when hostname is missing', () => {
    expect(
      resolveBrowserWebSocketUrl(
        {
          port: '43123',
        },
        {
          protocol: 'https:',
        }
      )
    ).toBe('ws://localhost:43123')
  })

  test('uses ws for direct non-loopback hosts outside proxied browser sessions', () => {
    expect(
      resolveBrowserWebSocketUrl(
        {
          port: '43123',
          host: 'devbox.internal',
        },
        {
          protocol: 'https:',
          hostname: 'preview.example.dev',
        }
      )
    ).toBe('ws://devbox.internal:43123')
  })
})
