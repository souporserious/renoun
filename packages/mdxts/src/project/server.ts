import { watch, type FSWatcher } from 'node:fs'

import { generateCollectionImportMap } from '../collections/import-maps'
import { analyzeSourceText } from '../utils/analyze-source-text'
import { WebSocketServer } from './rpc/server'
import { getProject, getProjects } from './get-project'
import { ProjectOptions } from './types'

const DEFAULT_IGNORED_PATHS = [
  'node_modules',
  'dist',
  'out',
  '.mdxts',
  '.next',
  '.turbo',
]
const watchers = new Map<string, FSWatcher>()

/** Create a WebSocket server. */
export function createServer() {
  /* Update the collection import maps when files change. */
  watch(process.cwd(), { recursive: true }, (_, filename) => {
    if (
      DEFAULT_IGNORED_PATHS.some((ignoredFile) =>
        filename?.startsWith(ignoredFile)
      )
    ) {
      return
    }

    for (const project of getProjects().values()) {
      generateCollectionImportMap(project)
    }
  })

  const server = new WebSocketServer()

  server.registerMethod(
    'analyzeSourceText',
    async ({
      projectOptions,
      ...options
    }: Parameters<typeof analyzeSourceText>[0] & {
      projectOptions?: ProjectOptions
    }) => {
      const project = await getProject(projectOptions)

      return analyzeSourceText({
        ...options,
        project,
      })
    }
  )

  server.registerMethod(
    'refreshWatch',
    async (options: { directory: string }) => {
      if (watchers.has(options.directory)) {
        return
      }

      const watcher = watch(
        options.directory,
        { persistent: true, recursive: true },
        () => {
          server.sendNotification({
            method: 'refreshUpdate',
            params: { directory: options.directory },
          })
        }
      )

      watchers.set(options.directory, watcher)
    }
  )

  server.registerMethod(
    'refreshUnwatch',
    async (options: { directory: string }) => {
      const watcher = watchers.get(options.directory)

      if (watcher) {
        watcher.close()
        watchers.delete(options.directory)
      }
    }
  )
}
