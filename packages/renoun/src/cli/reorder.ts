import { promises as fs } from 'node:fs'
import { join, resolve } from 'node:path'

import { getDebugLogger } from '../utils/debug.js'

interface ReorderableEntry {
  name: string
  path: string
  prefixNumber: number
  prefixWidth: number
  delimiter: string
  suffix: string
  mtimeMs: number
}

const PREFIX_PATTERN = /^(\d+)([._-])(.*)$/

function ensureDirectoryPath(pathLike: string | undefined): string {
  if (!pathLike) {
    throw new Error('No path provided. Usage: renoun reorder <path>')
  }
  return resolve(process.cwd(), pathLike)
}

async function readReorderableEntries(
  directory: string
): Promise<ReorderableEntry[]> {
  const dirents = await fs.readdir(directory, { withFileTypes: true })
  const entries: ReorderableEntry[] = []

  for (const dirent of dirents) {
    if (!dirent.isDirectory() && !dirent.isFile()) {
      continue
    }

    const match = PREFIX_PATTERN.exec(dirent.name)

    if (!match) {
      continue
    }

    const [, prefix, delimiter, suffix] = match
    const absolutePath = join(directory, dirent.name)
    const stats = await fs.stat(absolutePath)

    entries.push({
      name: dirent.name,
      path: absolutePath,
      prefixNumber: Number.parseInt(prefix, 10),
      prefixWidth: prefix.length,
      delimiter,
      suffix,
      mtimeMs: stats.mtimeMs,
    })
  }

  return entries
}

function formatPrefix(index: number, width: number): string {
  return String(index).padStart(width, '0')
}

/**
 * Reorders numbered entries in a directory while preserving duplicates.
 *
 * - Detect entries with a numeric prefix and delimiter, e.g. `01.file.mdx`.
 * - Sort by `prefixNumber` ascending; within the same prefix, sort by `mtimeMs` descending
 *   so that the last modified (newest) duplicate comes first.
 * - Do NOT discard duplicates. The newest duplicate retains the target order index; any older
 *   duplicates are assigned subsequent indices immediately after it.
 * - Preserve existing zero-padding width if any entry uses it; otherwise do not introduce padding.
 */
export async function reorderEntries(
  pathLike: string | undefined
): Promise<void> {
  const targetDirectory = ensureDirectoryPath(pathLike)
  getDebugLogger().info('Reordering entries', () => ({
    data: { targetDirectory },
  }))

  const entries = await readReorderableEntries(targetDirectory)

  if (entries.length === 0) {
    console.log('No reorderable entries found.')
    return
  }

  entries.sort((a, b) => {
    if (a.prefixNumber !== b.prefixNumber) {
      return a.prefixNumber - b.prefixNumber
    }
    return b.mtimeMs - a.mtimeMs
  })

  const maxPrefixWidth = entries.reduce(
    (max, entry) => Math.max(max, entry.prefixWidth),
    0
  )

  const hasLeadingZeroPadding = entries.some((entry) => {
    const numericLength = String(entry.prefixNumber).length
    return entry.prefixWidth > numericLength
  })

  const width = hasLeadingZeroPadding ? maxPrefixWidth : 0

  const startingPrefix = entries.reduce(
    (min, entry) => Math.min(min, entry.prefixNumber),
    entries[0]!.prefixNumber
  )

  const operations = entries.map((entry, index) => {
    const desiredIndex = startingPrefix + index
    const prefix = formatPrefix(desiredIndex, width)
    const newName = `${prefix}${entry.delimiter}${entry.suffix}`

    return {
      entry,
      desiredIndex,
      newName,
      needsRename: newName !== entry.name,
    }
  })

  const operationsNeedingRename = operations.filter(
    (operation) => operation.needsRename
  )

  if (operationsNeedingRename.length === 0) {
    console.log('All entries already ordered correctly.')
    return
  }

  const temporaryOperations = operationsNeedingRename.map(
    (operation, index) => {
      const tempName = `${operation.entry.name}.renoun-tmp-${process.pid}-${index}`
      return {
        ...operation,
        tempName,
        tempPath: join(targetDirectory, tempName),
      }
    }
  )

  for (const operation of temporaryOperations) {
    await fs.rename(operation.entry.path, operation.tempPath)
  }

  for (const operation of temporaryOperations) {
    const finalPath = join(targetDirectory, operation.newName)
    await fs.rename(operation.tempPath, finalPath)
    console.log(`${operation.entry.name} -> ${operation.newName}`)
  }

  console.log('Reordering complete.')
}
