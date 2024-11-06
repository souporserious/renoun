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
    const directories = new Set<string>()

    for (const filePath of this.#files.keys()) {
      if (filePath.startsWith(path)) {
        const relativePath = filePath.slice(path.length).replace(/^\//, '')
        const segments = relativePath.split('/').filter(Boolean)

        // Store all directories in the path
        let currentPath = path
        for (let index = 0; index < segments.length - 1; index++) {
          currentPath += `/${segments[index]}`
          directories.add(currentPath)
        }

        entries.push({
          name: segments.at(-1)!,
          isFile: true,
          isDirectory: false,
          path: filePath,
        })
      }
    }

    for (const directoryPath of directories) {
      if (!entries.some((entry) => entry.path === directoryPath)) {
        const segments = directoryPath.split('/').filter(Boolean)

        entries.push({
          name: segments.at(-1)!,
          isFile: false,
          isDirectory: true,
          path: directoryPath,
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
