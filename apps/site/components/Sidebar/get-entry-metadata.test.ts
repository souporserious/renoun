import { beforeEach, describe, expect, test, vi } from 'vitest'

const {
  isJavaScriptFileMock,
  isMDXFileMock,
  ModuleExportNotFoundErrorMock,
} = vi.hoisted(() => ({
  isJavaScriptFileMock: vi.fn<(entry: unknown) => boolean>(),
  isMDXFileMock: vi.fn<(entry: unknown) => boolean>(),
  ModuleExportNotFoundErrorMock: class ModuleExportNotFoundErrorMock extends Error {},
}))

vi.mock('renoun', () => ({
  ModuleExportNotFoundError: ModuleExportNotFoundErrorMock,
  isJavaScriptFile: isJavaScriptFileMock,
  isMDXFile: isMDXFileMock,
}))

import { getEntryMetadata } from './get-entry-metadata'

describe('getEntryMetadata', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    isJavaScriptFileMock.mockReturnValue(false)
    isMDXFileMock.mockReturnValue(false)
  })

  test('returns undefined for non JavaScript/MDX entries', async () => {
    const getExportValue = vi.fn()
    const entry = { getExportValue }

    await expect(getEntryMetadata(entry as any)).resolves.toBeUndefined()
    expect(getExportValue).not.toHaveBeenCalled()
  })

  test('reads metadata from JavaScript entries', async () => {
    isJavaScriptFileMock.mockReturnValue(true)
    const metadata = { title: 'Example' }
    const entry = {
      getExportValue: vi.fn().mockResolvedValue(metadata),
    }

    await expect(getEntryMetadata(entry as any)).resolves.toEqual(metadata)
    expect(entry.getExportValue).toHaveBeenCalledWith('metadata')
  })

  test('reads metadata from MDX entries', async () => {
    isMDXFileMock.mockReturnValue(true)
    const metadata = { title: 'MDX Example' }
    const entry = {
      getExportValue: vi.fn().mockResolvedValue(metadata),
    }

    await expect(getEntryMetadata(entry as any)).resolves.toEqual(metadata)
    expect(entry.getExportValue).toHaveBeenCalledWith('metadata')
  })

  test('returns undefined when metadata export is missing', async () => {
    isJavaScriptFileMock.mockReturnValue(true)
    const entry = {
      getExportValue: vi
        .fn()
        .mockRejectedValue(new ModuleExportNotFoundErrorMock('missing')),
    }

    await expect(getEntryMetadata(entry as any)).resolves.toBeUndefined()
  })

  test('rethrows unexpected metadata errors', async () => {
    isJavaScriptFileMock.mockReturnValue(true)
    const error = new Error('boom')
    const entry = {
      getExportValue: vi.fn().mockRejectedValue(error),
    }

    await expect(getEntryMetadata(entry as any)).rejects.toThrow('boom')
  })
})
