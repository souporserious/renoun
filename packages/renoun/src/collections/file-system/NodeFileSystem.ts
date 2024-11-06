import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { FileSystem } from './FileSystem'
import type { DirectoryEntry } from './types'

export class NodeFileSystem extends FileSystem {
  async readDirectory(path: string = '.'): Promise<DirectoryEntry[]> {
    const entries = await readdir(path, { withFileTypes: true })

    return entries.map((entry) => ({
      name: entry.name,
      path: join(path, entry.name),
      isDirectory: entry.isDirectory(),
      isFile: entry.isFile(),
    }))
  }

  async readFile(path: string): Promise<string> {
    return readFile(path, 'utf-8')
  }
}
