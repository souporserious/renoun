import type { IncomingMessage } from 'node:http'

import { isSameOrigin } from './websocket.ts'

const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1'])

function isLoopbackAddress(address: string | undefined): boolean {
  if (!address) {
    return false
  }

  return (
    address === '127.0.0.1' ||
    address === '::1' ||
    address === '::ffff:127.0.0.1'
  )
}

function isLoopbackHostname(hostname: string | undefined): boolean {
  if (!hostname) {
    return false
  }

  return LOOPBACK_HOSTNAMES.has(hostname.toLowerCase())
}

function readHeader(
  request: IncomingMessage,
  name: string
): string | undefined {
  const rawHeader = request.headers[
    name.toLowerCase() as keyof typeof request.headers
  ] as string | string[] | undefined

  if (Array.isArray(rawHeader)) {
    return rawHeader.join(', ')
  }

  return rawHeader
}

export function isAllowedAnalysisServerOrigin(
  originHeader: string | undefined,
  request: IncomingMessage
): boolean {
  const remoteAddress = request.socket.remoteAddress
  if (originHeader === undefined) {
    return isLoopbackAddress(remoteAddress)
  }

  const normalizedOrigin = originHeader.trim()
  const lowerCaseOrigin = normalizedOrigin.toLowerCase()
  if (
    lowerCaseOrigin === 'null' ||
    lowerCaseOrigin.startsWith('file:')
  ) {
    return isLoopbackAddress(remoteAddress)
  }

  const hostHeader = readHeader(request, 'host')
  if (isSameOrigin(normalizedOrigin, hostHeader)) {
    return true
  }

  try {
    const originUrl = new URL(normalizedOrigin)
    if (
      isLoopbackHostname(originUrl.hostname) &&
      isLoopbackAddress(remoteAddress)
    ) {
      return true
    }
  } catch {
    return false
  }

  return false
}
