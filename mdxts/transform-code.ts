import type { Options } from '@swc/core'
import { transform } from '@swc/core'

export const options = {
  jsc: {
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

export async function transformCode(codeString) {
  const result = await transform(codeString, options)

  return result.code
}
