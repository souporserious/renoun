import type * as NodeCrypto from 'node:crypto'

export const HASH_STRING_ALGORITHM = 'sha256' as const
export const HASH_STRING_HEX_LENGTH = 64 as const
export { stableStringify } from './stable-stringify.ts'

function getNodeCrypto(): typeof NodeCrypto | undefined {
  if (
    typeof process === 'undefined' ||
    typeof process.getBuiltinModule !== 'function'
  ) {
    return undefined
  }

  return (
    (process.getBuiltinModule('node:crypto') as typeof NodeCrypto | undefined) ??
    (process.getBuiltinModule('crypto') as typeof NodeCrypto | undefined)
  )
}

function hashStringInNonNodeRuntime(input: string): string {
  const seeds = [
    0x811c9dc5,
    0x01000193,
    0x9e3779b1,
    0x85ebca77,
  ]

  const parts = seeds.map((seed, seedIndex) => {
    let hash = (seed ^ seedIndex) >>> 0

    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index)
      hash = Math.imul(hash, 0x01000193) >>> 0
      hash ^= hash >>> 13
    }

    return hash.toString(16).padStart(8, '0')
  })

  return parts.join('').repeat(2)
}

export function hashString(input: string): string {
  const nodeCrypto = getNodeCrypto()

  if (nodeCrypto?.createHash) {
    return nodeCrypto
      .createHash(HASH_STRING_ALGORITHM)
      .update(input)
      .digest('hex')
  }

  return hashStringInNonNodeRuntime(input)
}
