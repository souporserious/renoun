import { describe, test, expect, vi } from 'vitest'

import { Loader } from './Loader'

describe('Loader', () => {
  test('initializes with runtime and schema options', () => {
    const loader = new Loader<{
      name: string
    }>({
      runtime: vi.fn(),
      schema: {
        name: (value) => value.toUpperCase(),
      },
    })

    expect(loader).toBeDefined()
  })

  test('resolves runtime value using a function', async () => {
    const runtime = vi.fn().mockResolvedValue('test-value')
    const loader = new Loader({ runtime })
    const result = await loader.resolveRuntimeValue('/test/path', 'testName')

    expect(runtime).toHaveBeenCalledWith('/test/path')
    expect(result).toBe('test-value')
  })

  test('throws if runtime is not provided', async () => {
    const loader = new Loader()

    await expect(
      loader.resolveRuntimeValue('/test/path', 'testName')
    ).rejects.toThrowError(
      '[renoun] Runtime option is required to resolve export "testName"'
    )
  })

  test('parses schema value if schema is configured', () => {
    const loader = new Loader({
      schema: {
        testName: (value) => value.toUpperCase(),
      },
    })

    const result = loader.parseSchemaValue('testName', 'test-value')

    expect(result).toBe('TEST-VALUE')
  })

  test('returns value unchanged if no schema is configured', () => {
    const loader = new Loader()

    const result = loader.parseSchemaValue('testName', 'test-value')

    expect(result).toBe('test-value')
  })

  test('throws if schema validation fails', () => {
    const loader = new Loader({
      schema: {
        testName: (_) => {
          throw new Error('Validation Error')
        },
      },
    })

    expect(() =>
      loader.parseSchemaValue('testName', 'test-value')
    ).toThrowError(
      '[renoun] Schema validation failed to parse export "testName", errored with: Validation Error'
    )
  })

  test('resolves runtime value using an object', async () => {
    const loader = new Loader({
      runtime: {
        '/test/path': () => Promise.resolve('test-value'),
      },
    })
    const result = await loader.resolveRuntimeValue('/test/path', 'testName')

    expect(result).toBe('test-value')
  })

  test('throws if runtime object does not contain path', async () => {
    const loader = new Loader({
      runtime: {
        '/another/path': () => Promise.resolve('test-value'),
      },
    })

    await expect(
      loader.resolveRuntimeValue('/test/path', 'testName')
    ).rejects.toThrowErrorMatchingInlineSnapshot(
      `[Error: [renoun] Runtime not defined for path "/test/path"]`
    )
  })

  test('throws if runtime is an invalid type', async () => {
    const loader = new Loader({
      // @ts-expect-error
      runtime: 123,
    })

    await expect(
      loader.resolveRuntimeValue('/test/path', 'testName')
    ).rejects.toThrowErrorMatchingInlineSnapshot(
      `[Error: [renoun] Runtime resolver failed for path "/test/path", errored with: [renoun] Runtime resolver for path "/test/path" is not a function]`
    )
  })
})
