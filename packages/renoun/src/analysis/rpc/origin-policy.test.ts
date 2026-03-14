import { describe, expect, test } from 'vitest'
import type { IncomingMessage } from 'node:http'

import { isAllowedAnalysisServerOrigin } from './origin-policy.ts'

function createRequest(options: {
  host?: string
  origin?: string
  protocol?: string
  remoteAddress?: string
}): IncomingMessage {
  return {
    headers: {
      ...(options.host ? { host: options.host } : {}),
      ...(options.origin ? { origin: options.origin } : {}),
      ...(options.protocol
        ? { 'sec-websocket-protocol': options.protocol }
        : {}),
    },
    socket: {
      remoteAddress: options.remoteAddress,
    },
  } as IncomingMessage
}

describe('isAllowedAnalysisServerOrigin', () => {
  test('rejects custom page origins even when the websocket request still targets loopback', () => {
    const request = createRequest({
      host: '127.0.0.1:43123',
      origin: 'https://preview.example.dev',
      protocol: 'server-id',
      remoteAddress: '127.0.0.1',
    })

    expect(
      isAllowedAnalysisServerOrigin(
        'https://preview.example.dev',
        request
      )
    ).toBe(false)
  })

  test('allows loopback origins from loopback clients without the fallback protocol path', () => {
    const request = createRequest({
      host: '127.0.0.1:43123',
      origin: 'http://localhost:3000',
      remoteAddress: '127.0.0.1',
    })

    expect(
      isAllowedAnalysisServerOrigin(
        'http://localhost:3000',
        request
      )
    ).toBe(true)
  })

  test('allows bracketed ipv6 loopback origins from loopback clients', () => {
    const request = createRequest({
      host: '[::1]:43123',
      origin: 'http://[::1]:3000',
      remoteAddress: '::1',
    })

    expect(
      isAllowedAnalysisServerOrigin(
        'http://[::1]:3000',
        request
      )
    ).toBe(true)
  })

  test('rejects custom page origins when the client is not loopback', () => {
    const request = createRequest({
      host: '127.0.0.1:43123',
      origin: 'https://preview.example.dev',
      protocol: 'server-id',
      remoteAddress: '192.168.1.24',
    })

    expect(
      isAllowedAnalysisServerOrigin(
        'https://preview.example.dev',
        request
      )
    ).toBe(false)
  })

  test('rejects non-http origins even when the websocket request targets loopback', () => {
    const request = createRequest({
      host: '127.0.0.1:43123',
      origin: 'chrome-extension://renoun-devtools',
      remoteAddress: '127.0.0.1',
    })

    expect(
      isAllowedAnalysisServerOrigin(
        'chrome-extension://renoun-devtools',
        request
      )
    ).toBe(false)
  })
})
