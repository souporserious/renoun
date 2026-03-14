import type { IncomingMessage } from 'node:http'

import { isSameOrigin } from './websocket.ts'

const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1'])

function normalizeHostname(hostname: string | undefined): string | undefined {
  if (!hostname) {
    return undefined
  }

  const normalizedHostname = hostname
    .trim()
    .replace(/^\[/, '')
    .replace(/\]$/, '')
    .toLowerCase()

  return normalizedHostname.length > 0 ? normalizedHostname : undefined
}

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
  const normalizedHostname = normalizeHostname(hostname)
  if (!normalizedHostname) {
    return false
  }

  return LOOPBACK_HOSTNAMES.has(normalizedHostname)
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
  const loopbackClient = isLoopbackAddress(remoteAddress)
  if (originHeader === undefined) {
    return loopbackClient
  }

  const normalizedOrigin = originHeader.trim()
  const lowerCaseOrigin = normalizedOrigin.toLowerCase()
  if (
    lowerCaseOrigin === 'null' ||
    lowerCaseOrigin.startsWith('file:')
  ) {
    return loopbackClient
  }

  const hostHeader = readHeader(request, 'host')
  if (isSameOrigin(normalizedOrigin, hostHeader)) {
    return true
  }

  try {
    const originUrl = new URL(normalizedOrigin)
    if (loopbackClient && isLoopbackHostname(originUrl.hostname)) {
      return true
    }
  } catch {
    return false
  }

  return false
}
