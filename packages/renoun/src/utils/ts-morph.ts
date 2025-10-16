import { createRequire } from 'node:module'

let cachedTsMorph: typeof import('ts-morph') | undefined

/** Lazily load the CommonJS ts-morph package in Node environments. */
export function getTsMorph(): typeof import('ts-morph') {
  if (cachedTsMorph === undefined) {
    const require = createRequire(import.meta.url)
    cachedTsMorph = require('ts-morph') as typeof import('ts-morph')
  }

  return cachedTsMorph
}

export type * from 'ts-morph'
