import { watch } from 'node:fs'
import { minimatch } from 'minimatch'

import { writeCollectionImports } from '../collections/write-collection-imports.js'
import { analyzeSourceText as baseAnalyzeSourceText } from '../utils/analyze-source-text.js'
import {
  createHighlighter,
  type Highlighter,
} from '../utils/create-highlighter.js'
import {
  getFileExports as baseGetFileExports,
  getFileExportMetadata as baseGetFileExportMetadata,
} from '../utils/get-file-exports.js'
import { getRootDirectory } from '../utils/get-root-directory.js'
import type { SymbolFilter } from '../utils/resolve-type.js'
import { resolveTypeAtLocation as baseResolveTypeAtLocation } from '../utils/resolve-type-at-location.js'
import { transpileSourceFile as baseTranspileSourceFile } from '../utils/transpile-source-file.js'
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
    'analyzeSourceText',
    async function analyzeSourceText({
      projectOptions,
      ...options
    }: Parameters<typeof baseAnalyzeSourceText>[0] & {
      projectOptions?: ProjectOptions
    }) {
      const project = getProject(projectOptions)

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
    'resolveTypeAtLocation',
    async function resolveTypeAtLocation({
      projectOptions,
      filter,
      ...options
    }: {
      filePath: string
      position: number
      filter?: string
      projectOptions?: ProjectOptions
    }) {
      const project = getProject(projectOptions)
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

      return baseResolveTypeAtLocation(
        project,
        options.filePath,
        options.position,
        filterFn,
        projectOptions?.useInMemoryFileSystem
      )
    }
  )

  server.registerMethod(
    'getFileExports',
    async function getFileExports({
      filePath,
      projectOptions,
    }: {
      filePath: string
      projectOptions?: ProjectOptions
    }) {
      const project = getProject(projectOptions)
      return baseGetFileExports(filePath, project)
    }
  )

  server.registerMethod(
    'getFileExportMetadata',
    async function getFileExportMetadata({
      filePath,
      name,
      position,
      projectOptions,
    }: {
      filePath: string
      name: string
      position: number
      projectOptions?: ProjectOptions
    }) {
      const project = getProject(projectOptions)
      return baseGetFileExportMetadata(filePath, name, position, project)
    }
  )

  server.registerMethod(
    'createSourceFile',
    async function createSourceFile({
      filePath,
      sourceText,
      projectOptions,
    }: {
      filePath: string
      sourceText: string
      projectOptions?: ProjectOptions
    }) {
      const project = getProject(projectOptions)
      project.createSourceFile(filePath, sourceText, {
        overwrite: true,
      })
    }
  )

  server.registerMethod(
    'transpileSourceFile',
    async function transpileSourceFile({
      filePath,
      projectOptions,
    }: {
      filePath: string
      projectOptions?: ProjectOptions
    }) {
      const project = getProject(projectOptions)
      return baseTranspileSourceFile(filePath, project)
    }
  )

  return server
}
