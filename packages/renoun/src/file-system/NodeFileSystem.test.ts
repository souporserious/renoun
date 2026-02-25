import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { afterAll, describe, expect, test } from 'vitest'

import { getRootDirectory } from '../utils/get-root-directory.ts'
import { NodeFileSystem } from './NodeFileSystem'

async function readStream(
  stream: ReadableStream<Uint8Array>
): Promise<Uint8Array> {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []

  try {
    let result = await reader.read()
    while (!result.done) {
      chunks.push(result.value.slice())
      result = await reader.read()
    }
  } finally {
    reader.releaseLock()
  }

  return concatenate(chunks)
}

function concatenate(chunks: Uint8Array[]): Uint8Array {
  const size = chunks.reduce((total, chunk) => total + chunk.byteLength, 0)
  const combined = new Uint8Array(size)
  let offset = 0

  for (const chunk of chunks) {
    combined.set(chunk, offset)
    offset += chunk.byteLength
  }

  return combined
}

function runGit(cwd: string, args: string[]): string {
  const result = spawnSync('git', args, {
    cwd,
    stdio: 'pipe',
    encoding: 'utf8',
    shell: false,
  })

  if (result.status !== 0) {
    throw new Error(
      `[NodeFileSystem.test] git ${args.join(' ')} failed\n${result.stderr}`
    )
  }

  return result.stdout.trim()
}

describe('NodeFileSystem', () => {
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()
  const rootDirectory = getRootDirectory()
  const baseTmpDirectory = join(rootDirectory, 'tmp-tests')
  mkdirSync(baseTmpDirectory, { recursive: true })
  const tempDirectory = mkdtempSync(join(baseTmpDirectory, 'node-fs-'))
  const outsideDirectories: string[] = []
  const fileSystem = new NodeFileSystem()

  const textFilePath = join(tempDirectory, 'text.txt')
  const binaryFilePath = join(tempDirectory, 'binary.bin')
  const streamFilePath = join(tempDirectory, 'stream.txt')

  test('supports binary read and write operations', async () => {
    await fileSystem.writeFile(textFilePath, 'Hello World')

    expect(await fileSystem.readFile(textFilePath)).toBe('Hello World')
    expect(decoder.decode(await fileSystem.readFileBinary(textFilePath))).toBe(
      'Hello World'
    )

    fileSystem.writeFileSync(binaryFilePath, new Uint8Array([1, 2, 3]))

    expect(Array.from(fileSystem.readFileBinarySync(binaryFilePath))).toEqual([
      1, 2, 3,
    ])
  })

  test('supports streaming writes and reads', async () => {
    const writer = fileSystem.writeFileStream(streamFilePath).getWriter()
    await writer.write(encoder.encode('chunk-1 '))
    await writer.write(encoder.encode('chunk-2'))
    await writer.close()

    const streamContents = await readStream(
      fileSystem.readFileStream(streamFilePath)
    )

    expect(decoder.decode(streamContents)).toBe('chunk-1 chunk-2')
    expect(await fileSystem.readFile(streamFilePath)).toBe('chunk-1 chunk-2')
  })

  test('deleteFile removes files and fileExists reflects state', async () => {
    await fileSystem.writeFile(binaryFilePath, encoder.encode('data'))

    expect(await fileSystem.fileExists(binaryFilePath)).toBe(true)
    await fileSystem.deleteFile(binaryFilePath)
    expect(await fileSystem.fileExists(binaryFilePath)).toBe(false)
  })

  test('prevents path traversal via symlinks escaping the workspace', async () => {
    const outsideDirectory = mkdtempSync(join(rootDirectory, '..', 'node-fs-'))
    outsideDirectories.push(outsideDirectory)

    const outsideFilePath = join(outsideDirectory, 'secret.txt')
    writeFileSync(outsideFilePath, 'classified data')

    const traversalDirectory = join(tempDirectory, 'escape')
    symlinkSync(outsideDirectory, traversalDirectory, 'dir')

    const traversalPath = join(traversalDirectory, 'secret.txt')
    await expect(fileSystem.readFile(traversalPath)).rejects.toThrow(
      /outside of the workspace root/i
    )
  })

  test('rejects rename/copy targets outside the workspace root', async () => {
    const outsideDirectory = mkdtempSync(
      join(rootDirectory, '..', 'node-fs-outside-')
    )
    outsideDirectories.push(outsideDirectory)
    const outsidePath = join(outsideDirectory, 'outside.txt')
    const target = join(tempDirectory, 'outside-copy.txt')

    writeFileSync(outsidePath, 'outside')

    await expect(fileSystem.rename(outsidePath, target)).rejects.toThrow(
      /outside of the workspace root/i
    )
    await expect(fileSystem.copy(outsidePath, target)).rejects.toThrow(
      /outside of the workspace root/i
    )
  })

  test('rename and copy respect overwrite options', async () => {
    const source = join(tempDirectory, 'source.txt')
    const target = join(tempDirectory, 'target.txt')
    await fileSystem.writeFile(source, 'alpha')
    await fileSystem.writeFile(target, 'beta')

    await expect(fileSystem.rename(source, target)).rejects.toThrow(
      /target already exists/
    )

    await fileSystem.rename(source, target, { overwrite: true })
    expect(await fileSystem.readFile(target)).toBe('alpha')
    expect(await fileSystem.fileExists(source)).toBe(false)

    const copySource = join(tempDirectory, 'copy-source.txt')
    const copyTarget = join(tempDirectory, 'copy-target.txt')
    await fileSystem.writeFile(copySource, 'copy')
    await fileSystem.writeFile(copyTarget, 'existing')

    await expect(fileSystem.copy(copySource, copyTarget)).rejects.toThrow(
      /target already exists/
    )
    await fileSystem.copy(copySource, copyTarget, { overwrite: true })
    expect(await fileSystem.readFile(copyTarget)).toBe('copy')
    expect(await fileSystem.fileExists(copySource)).toBe(true)
  })

  test('rename and copy treat equivalent absolute and relative forms as the same path', async () => {
    const previousCwd = process.cwd()
    const source = 'canonical.txt'
    const absoluteSource = join(tempDirectory, source)
    process.chdir(tempDirectory)

    try {
      await fileSystem.writeFile(absoluteSource, 'canonical')

      await expect(
        fileSystem.rename(absoluteSource, `./${source}`)
      ).resolves.toBeUndefined()
      await expect(
        fileSystem.copy(`./${source}`, absoluteSource)
      ).resolves.toBeUndefined()

      expect(await fileSystem.readFile(absoluteSource)).toBe('canonical')
    } finally {
      process.chdir(previousCwd)
    }
  })

  test('copy supports recursive directories', async () => {
    const sourceDir = join(tempDirectory, 'dir')
    const nestedDir = join(sourceDir, 'sub')
    mkdirSync(nestedDir, { recursive: true })
    const nestedFile = join(nestedDir, 'file.txt')
    writeFileSync(nestedFile, 'nested')

    const targetDir = join(tempDirectory, 'dir-copy')
    await fileSystem.copy(sourceDir, targetDir)

    expect(await fileSystem.readFile(join(targetDir, 'sub', 'file.txt'))).toBe(
      'nested'
    )
  })

  test('metadata helpers return undefined for missing paths', async () => {
    const existingPath = join(tempDirectory, 'meta.txt')
    await fileSystem.writeFile(existingPath, 'hello')

    expect(fileSystem.getFileByteLengthSync(existingPath)).toBe(5)
    await expect(fileSystem.getFileByteLength(existingPath)).resolves.toBe(5)

    const mtimeSync = fileSystem.getFileLastModifiedMsSync(existingPath)
    expect(typeof mtimeSync).toBe('number')
    expect(mtimeSync).toBeGreaterThan(0)
    const mtimeAsync = await fileSystem.getFileLastModifiedMs(existingPath)
    expect(typeof mtimeAsync).toBe('number')
    expect(mtimeAsync).toBeGreaterThan(0)

    const missingPath = join(tempDirectory, 'missing-meta.txt')
    expect(fileSystem.getFileByteLengthSync(missingPath)).toBeUndefined()
    await expect(fileSystem.getFileByteLength(missingPath)).resolves.toBe(
      undefined
    )
    expect(fileSystem.getFileLastModifiedMsSync(missingPath)).toBeUndefined()
    await expect(fileSystem.getFileLastModifiedMs(missingPath)).resolves.toBe(
      undefined
    )
  })

  test('resolves bare relative paths from the current working directory', () => {
    const uniqueId = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const cwdDirectory = mkdtempSync(join(tempDirectory, 'cwd-'))
    const rootOnlyPath = join(rootDirectory, `root-only-${uniqueId}.txt`)
    const sharedName = `shared-${uniqueId}.txt`

    writeFileSync(rootOnlyPath, 'workspace')
    writeFileSync(join(cwdDirectory, sharedName), 'cwd-shared')

    const previousCwd = process.cwd()
    process.chdir(cwdDirectory)

    try {
      expect(fileSystem.getAbsolutePath(`root-only-${uniqueId}.txt`)).toBe(
        join(cwdDirectory, `root-only-${uniqueId}.txt`)
      )
      expect(fileSystem.getAbsolutePath(sharedName)).toBe(
        join(cwdDirectory, sharedName)
      )
      expect(fileSystem.getAbsolutePath(`./${sharedName}`)).toBe(
        join(cwdDirectory, sharedName)
      )
      expect(fileSystem.getAbsolutePath(`./${sharedName}`)).toBe(
        fileSystem.getAbsolutePath(sharedName)
      )
    } finally {
      process.chdir(previousCwd)
      rmSync(rootOnlyPath, { force: true })
    }
  })

  test('returns workspace change tokens for repository root paths', async () => {
    const repoRoot = mkdtempSync(join(baseTmpDirectory, 'node-fs-git-'))

    try {
      runGit(repoRoot, ['init'])
      runGit(repoRoot, ['config', 'user.name', 'Renoun Tests'])
      runGit(repoRoot, ['config', 'user.email', 'tests@renoun.dev'])

      const trackedPath = join(repoRoot, 'tracked.ts')
      writeFileSync(trackedPath, 'export const value = 1\n')
      runGit(repoRoot, ['add', 'tracked.ts'])
      runGit(repoRoot, ['commit', '-m', 'init'])

      const initialToken = await fileSystem.getWorkspaceChangeToken(repoRoot)
      expect(initialToken).toBeTruthy()

      writeFileSync(trackedPath, 'export const value = 2\n')
      const updatedToken = await fileSystem.getWorkspaceChangeToken(repoRoot)

      expect(updatedToken).toBeTruthy()
      expect(updatedToken).not.toBe(initialToken)
    } finally {
      rmSync(repoRoot, { recursive: true, force: true })
    }
  })

  test('changes workspace token when editing an already dirty file', async () => {
    const repoRoot = mkdtempSync(join(baseTmpDirectory, 'node-fs-git-dirty-'))

    try {
      runGit(repoRoot, ['init'])
      runGit(repoRoot, ['config', 'user.name', 'Renoun Tests'])
      runGit(repoRoot, ['config', 'user.email', 'tests@renoun.dev'])

      const trackedPath = join(repoRoot, 'tracked.ts')
      writeFileSync(trackedPath, 'export const value = 1\n')
      runGit(repoRoot, ['add', 'tracked.ts'])
      runGit(repoRoot, ['commit', '-m', 'init'])

      writeFileSync(trackedPath, 'export const value = 22\n')
      const firstDirtyToken = await fileSystem.getWorkspaceChangeToken(repoRoot)

      writeFileSync(trackedPath, 'export const value = 333\n')
      const secondDirtyToken = await fileSystem.getWorkspaceChangeToken(
        repoRoot
      )

      expect(firstDirtyToken).toBeTruthy()
      expect(secondDirtyToken).toBeTruthy()
      expect(secondDirtyToken).not.toBe(firstDirtyToken)

      const changedPaths = await fileSystem.getWorkspaceChangedPathsSinceToken(
        repoRoot,
        firstDirtyToken!
      )
      const expectedPath = fileSystem.getRelativePathToWorkspace(trackedPath)
      expect(changedPaths ?? []).toContain(expectedPath)
    } finally {
      rmSync(repoRoot, { recursive: true, force: true })
    }
  })

  afterAll(() => {
    rmSync(tempDirectory, { recursive: true, force: true })
    for (const directory of outsideDirectories) {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})
