import { watch } from 'node:fs'
import { minimatch } from 'minimatch'

import { writeCollectionImports } from '../collections/write-collection-imports.js'
import { analyzeSourceText as baseAnalyzeSourceText } from '../utils/analyze-source-text.js'
import {
  createHighlighter,
  type Highlighter,
} from '../utils/create-highlighter.js'
import { getRootDirectory } from '../utils/get-root-directory.js'
import { getSourceFilesOrderMap as baseGetSourceFilesOrderMap } from '../utils/get-source-files-order-map.js'
import { getSourceFilesPathMap as baseGetSourceFilesPathMap } from '../utils/get-source-files-path-map.js'
import type { SymbolFilter } from '../utils/resolve-type.js'
import { resolveTypeAtLocation } from '../utils/resolve-type-at-location.js'
import { WebSocketServer } from './rpc/server.js'
import { getProject } from './get-project.js'
import { ProjectOptions } from './types.js'

const DEFAULT_IGNORED_PATTERNS = [
  '.git',
  '.next',
  '.turbo',
  'build',
  'dist',
  'node_modules',
  'out',
].map((directory) => `**/${directory}/**`)

function shouldIgnore(filePath: string): boolean {
  return DEFAULT_IGNORED_PATTERNS.some((pattern) =>
    minimatch(filePath, pattern)
  )
}

let currentHighlighter: Highlighter | null = null

if (currentHighlighter === null) {
  createHighlighter().then((highlighter) => {
    currentHighlighter = highlighter
  })
}

/** Create a WebSocket server. */
export function createServer() {
  const server = new WebSocketServer()

  if (process.env.NODE_ENV === 'development') {
    watch(getRootDirectory(), { recursive: true }, (_, filename) => {
      if (!filename || shouldIgnore(filename)) {
        return
      }

      /* Update all collection import maps when files change. */
      writeCollectionImports(filename).then(() => {
        /* Notify the client to refresh when files change. */
        server.sendNotification({ type: 'refresh' })
      })
    })
  }

  server.registerMethod(
    'getSourceFilesOrderMap',
    async function getSourceFilesOrderMap(options: {
      baseFilePattern: string
      tsConfigFilePath: string
    }) {
      const project = await getProject({
        tsConfigFilePath: options.tsConfigFilePath,
      })
      const baseDirectory = project.getDirectoryOrThrow(options.baseFilePattern)

      return baseGetSourceFilesOrderMap(baseDirectory)
    }
  )

  server.registerMethod(
    'getSourceFilesPathMap',
    async function getSourceFilesPathMap(options: {
      baseFilePattern: string
      baseDirectory?: string
      basePath?: string
      tsConfigFilePath: string
    }) {
      const project = await getProject({
        tsConfigFilePath: options.tsConfigFilePath,
      })
      const baseDirectory = project.getDirectoryOrThrow(options.baseFilePattern)

      return baseGetSourceFilesPathMap(baseDirectory, {
        baseDirectory: options.baseDirectory,
        basePath: options.basePath,
      })
    }
  )

  server.registerMethod(
    'analyzeSourceText',
    async function analyzeSourceText({
      projectOptions,
      ...options
    }: Parameters<typeof baseAnalyzeSourceText>[0] & {
      projectOptions?: ProjectOptions
    }) {
      const project = await getProject(projectOptions)

      if (currentHighlighter === null) {
        throw new Error(
          '[renoun] Highlighter is not initialized in web socket "analyzeSourceText"'
        )
      }

      return baseAnalyzeSourceText({
        ...options,
        highlighter: currentHighlighter,
        project,
      })
    }
  )

  server.registerMethod(
    'resolveType',
    async function resolveType({
      projectOptions,
      filter,
      ...options
    }: {
      filePath: string
      position: number
      filter?: string
      projectOptions?: ProjectOptions
    }) {
      const project = await getProject(projectOptions)
      const filterFn = filter
        ? (new Function(
            'symbolMetadata',
            `try {
           return (${filter})(symbolMetadata)
         } catch (error) {
           if (error instanceof ReferenceError) {
             throw new Error(
               '[renoun]: A ReferenceError occured in the collection filter, this may have been caused by a variable defined outside the function scope. Ensure that all variables are defined within the filter function since it is serialized.',
               { cause: error }
             )
           } else {
             throw error
           }
         }`
          ) as SymbolFilter)
        : undefined

      return resolveTypeAtLocation(
        project,
        options.filePath,
        options.position,
        filterFn
      )
    }
  )

  return server
}
