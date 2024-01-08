import type { Options } from '@swc/core'
import { transform, transformSync } from '@swc/core'

export const options = {
  jsc: {
    target: 'es2020',
    parser: {
      syntax: 'typescript',
      tsx: true,
    },
    transform: {
      react: {
        runtime: 'automatic',
      },
    },
  },
  module: {
    type: 'commonjs',
  },
} as Options

/** Transform code using SWC. */
export async function transformCode(codeString: string) {
  const result = await transform(codeString, options)
  return result.code
}

/** Transform code synchronously using SWC. */
export function transformCodeSync(codeString: string) {
  const result = transformSync(codeString, options)
  return result.code
}
