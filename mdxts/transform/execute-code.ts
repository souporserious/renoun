import { transformCode } from './transform-code'

/** Execute code using a Function constructor. */
export async function executeCode(codeString: string) {
  const transformedCode = await transformCode(codeString)
  const exports: Record<string, unknown> = {}
  const result = new Function('exports', 'require', transformedCode)

  result(exports, require)

  return exports.default as (...args: unknown[]) => unknown
}
