import { readdir, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

import { FileSystem } from './FileSystem'
import type { DirectoryEntry } from './types'

export class NodeFileSystem extends FileSystem {
  async readDirectory(path: string = '.'): Promise<DirectoryEntry[]> {
    const entries = await readdir(path, { withFileTypes: true })

    return entries.map((entry) => {
      let entryPath = join(path, entry.name)

      if (!entryPath.startsWith('.')) {
        entryPath = `./${entryPath}`
      }

      return {
        name: entry.name,
        path: entryPath,
        absolutePath: resolve(entryPath),
        isDirectory: entry.isDirectory(),
        isFile: entry.isFile(),
      } satisfies DirectoryEntry
    })
  }

  async readFile(path: string): Promise<string> {
    return readFile(path, 'utf-8')
  }
}
