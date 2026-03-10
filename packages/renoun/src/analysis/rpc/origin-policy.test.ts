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
  test('rejects proxied preview origins even when they present the server id', () => {
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
})
