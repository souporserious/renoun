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

function requestTargetsLoopbackHost(hostHeader: string | undefined): boolean {
  if (!hostHeader) {
    return false
  }

  try {
    return isLoopbackHostname(new URL(`http://${hostHeader}`).hostname)
  } catch {
    return false
  }
}

function offersServerProtocol(
  protocolHeader: string | undefined,
  serverId: string
): boolean {
  if (!protocolHeader) {
    return false
  }

  return protocolHeader
    .split(',')
    .map((value) => value.trim())
    .some((value) => value === serverId)
}

export function isAllowedProjectServerOrigin(
  originHeader: string | undefined,
  request: IncomingMessage,
  serverId: string
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

  return (
    isLoopbackAddress(remoteAddress) &&
    requestTargetsLoopbackHost(hostHeader) &&
    offersServerProtocol(
      readHeader(request, 'sec-websocket-protocol'),
      serverId
    )
  )
}
