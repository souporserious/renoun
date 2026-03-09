import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'

import {
  clearSharedFileTextPrefixCache,
  configureSharedFileTextPrefixCacheRuntime,
  getSharedFileTextPrefix,
  getSharedFileTextPrefixCacheStats,
  invalidateSharedFileTextPrefixCachePath,
  invalidateSharedFileTextPrefixCachePaths,
  resetSharedFileTextPrefixCacheRuntimeConfiguration,
} from './file-text-prefix-cache.ts'

describe('file text prefix cache', () => {
  let workspacePath: string | undefined

  afterEach(async () => {
    clearSharedFileTextPrefixCache()
    resetSharedFileTextPrefixCacheRuntimeConfiguration()
    if (workspacePath) {
      await rm(workspacePath, { recursive: true, force: true })
      workspacePath = undefined
    }
  })

  test('reuses cached file prefix reads and refreshes on invalidation', async () => {
    workspacePath = await mkdtemp(join(tmpdir(), 'renoun-prefix-cache-'))
    const filePath = join(workspacePath, 'guide.mdx')

    await writeFile(filePath, '```ts\nconst a = 1\n```', 'utf8')
    const first = await getSharedFileTextPrefix(filePath, 1024)
    await writeFile(filePath, '```bash\necho hi\n```', 'utf8')

    const second = await getSharedFileTextPrefix(filePath, 1024)
    expect(second).toBe(first)

    const cachedStats = getSharedFileTextPrefixCacheStats()
    expect(cachedStats.readCount).toBe(1)
    expect(cachedStats.hitCount).toBeGreaterThanOrEqual(1)

    invalidateSharedFileTextPrefixCachePath(filePath)
    const third = await getSharedFileTextPrefix(filePath, 1024)
    expect(third).toContain('bash')
    expect(getSharedFileTextPrefixCacheStats().readCount).toBe(2)
  })

  test('invalidates cached descendants when a directory path is invalidated', async () => {
    workspacePath = await mkdtemp(join(tmpdir(), 'renoun-prefix-cache-'))
    const nestedDirectoryPath = join(workspacePath, 'docs')
    const filePath = join(nestedDirectoryPath, 'nested.mdx')

    await mkdir(nestedDirectoryPath, { recursive: true })
    await writeFile(filePath, '```ts\nconst one = 1\n```', 'utf8')
    await getSharedFileTextPrefix(filePath, 1024)

    await writeFile(filePath, '```tsx\nconst two = <div />\n```', 'utf8')
    invalidateSharedFileTextPrefixCachePaths([nestedDirectoryPath])

    const next = await getSharedFileTextPrefix(filePath, 1024)
    expect(next).toContain('tsx')
  })

  test('re-reads when callers require a larger prefix window', async () => {
    workspacePath = await mkdtemp(join(tmpdir(), 'renoun-prefix-cache-'))
    const filePath = join(workspacePath, 'large.mdx')
    const sourceText =
      '---\n' +
      'title: Large\n' +
      '---\n\n' +
      'x'.repeat(120) +
      '\n```rust\nfn main() {}\n```'
    await writeFile(filePath, sourceText, 'utf8')

    const smallWindow = await getSharedFileTextPrefix(filePath, 64)
    expect(smallWindow).not.toContain('```rust')
    expect(getSharedFileTextPrefixCacheStats().readCount).toBe(1)

    const largeWindow = await getSharedFileTextPrefix(filePath, 512)
    expect(largeWindow).toContain('```rust')
    expect(getSharedFileTextPrefixCacheStats().readCount).toBe(2)
  })

  test('evicts least recently used entries when max entry count is exceeded', async () => {
    workspacePath = await mkdtemp(join(tmpdir(), 'renoun-prefix-cache-'))
    configureSharedFileTextPrefixCacheRuntime({ maxEntries: 1 })

    const firstPath = join(workspacePath, 'first.mdx')
    const secondPath = join(workspacePath, 'second.mdx')
    await writeFile(firstPath, '```ts\nconst first = 1\n```', 'utf8')
    await writeFile(secondPath, '```ts\nconst second = 2\n```', 'utf8')

    await getSharedFileTextPrefix(firstPath, 1024)
    await getSharedFileTextPrefix(secondPath, 1024)
    await writeFile(firstPath, '```bash\necho first\n```', 'utf8')

    const refreshedFirst = await getSharedFileTextPrefix(firstPath, 1024)
    expect(refreshedFirst).toContain('bash')
    expect(getSharedFileTextPrefixCacheStats().readCount).toBe(3)
  })
})
