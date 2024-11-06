import { FileSystem } from './FileSystem'
import type { DirectoryEntry } from './types'

export class VirtualFileSystem extends FileSystem {
  #files: Map<string, string>

  constructor(files: { [path: string]: string }) {
    super()
    this.#files = new Map(Object.entries(files))
  }

  async readDirectory(path: string = '.'): Promise<DirectoryEntry[]> {
    const entries: DirectoryEntry[] = []

    for (const filePath of this.#files.keys()) {
      if (filePath.startsWith(path)) {
        const relativePath = filePath.slice(path.length)
        const segments = relativePath.split('/').filter(Boolean)
        const name = segments.at(-1)!
        const isFile = this.#files.has(filePath)

        entries.push({
          name,
          isFile,
          isDirectory: !isFile,
          path: filePath,
        })
      }
    }

    return entries
  }

  async readFile(path: string): Promise<string> {
    const content = this.#files.get(path)
    if (content === undefined) {
      throw new Error(`File not found: ${path}`)
    }
    return content
  }
}
