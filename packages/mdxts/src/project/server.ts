import { watch, type FSWatcher } from 'node:fs'

import { analyzeSourceText } from '../utils/analyze-source-text'
import { WebSocketServer } from './rpc/server'
import { getProject } from './get-project'
import { ProjectOptions } from './types'

const watchers = new Map<string, FSWatcher>()

/** Create a WebSocket server. */
export function createServer() {
  const server = new WebSocketServer()

  server.registerMethod(
    'analyzeSourceText',
    async ({
      projectOptions,
      ...options
    }: Parameters<typeof analyzeSourceText>[0] & {
      projectOptions?: ProjectOptions
    }) => {
      const project = getProject(projectOptions)

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

  return server
}
