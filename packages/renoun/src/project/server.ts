import { watch, type FSWatcher } from 'node:fs'
import { join } from 'node:path'
import { getTsMorph } from '../utils/ts-morph.ts'
import type { SyntaxKind as TsMorphSyntaxKind } from '../utils/ts-morph.ts'

import {
  createHighlighter,
  type Highlighter,
} from '../utils/create-highlighter.ts'
import type { ConfigurationOptions } from '../components/Config/types.ts'
import { getDebugLogger } from '../utils/debug.ts'
import { getFileExportText as baseGetFileExportText } from '../utils/get-file-export-text.ts'
import { getRootDirectory } from '../utils/get-root-directory.ts'
import {
  getTokens as baseGetTokens,
  type GetTokensOptions,
} from '../utils/get-tokens.ts'
import {
  getSourceTextMetadata as baseGetSourceTextMetadata,
  type GetSourceTextMetadataOptions,
} from '../utils/get-source-text-metadata.ts'
import { isFilePathGitIgnored } from '../utils/is-file-path-git-ignored.ts'
import {
  resolveTypeAtLocationWithDependencies as baseResolveTypeAtLocationWithDependencies,
} from '../utils/resolve-type-at-location.ts'
import type { TypeFilter } from '../utils/resolve-type.ts'
import { WebSocketServer } from './rpc/server.ts'
import {
  getCachedFileExportMetadata,
  getCachedFileExportStaticValue,
  getCachedFileExports,
  getCachedOutlineRanges,
  transpileCachedSourceFile,
} from './cached-analysis.ts'
import { invalidateProjectFileCache } from './cache.ts'
import { disposeProjectWatchers, getProject } from './get-project.ts'
import type { ProjectOptions } from './types.ts'

const { SyntaxKind } = getTsMorph()

let currentHighlighter: Promise<Highlighter> | null = null
let activeProjectServers = 0

interface ResolveTypeAtLocationRpcRequest {
  filePath: string
  position: number
  kind: TsMorphSyntaxKind
  filter?: TypeFilter | string
  projectOptions?: ProjectOptions
}

function parseTypeFilter(filter?: TypeFilter | string): TypeFilter | undefined {
  if (filter === undefined) {
    return undefined
  }

  const parsedFilter = typeof filter === 'string' ? parseTypeFilterJson(filter) : filter

  if (!isValidTypeFilter(parsedFilter)) {
    throw new Error(
      '[renoun] Invalid type filter payload. Expected a TypeFilter object or JSON stringified TypeFilter.'
    )
  }

  return parsedFilter
}

function parseTypeFilterJson(value: string) {
  try {
    return JSON.parse(value)
  } catch {
    throw new Error('[renoun] Invalid type filter JSON payload.')
  }
}

function isValidTypeFilter(value: unknown): value is TypeFilter {
  if (Array.isArray(value)) {
    return value.every(isValidFilterDescriptor)
  }

  return isValidFilterDescriptor(value)
}

function isValidFilterDescriptor(value: unknown): value is TypeFilter {
  if (!isObject(value)) {
    return false
  }

  const candidate = value as {
    moduleSpecifier?: unknown
    types?: unknown
  }

  if (
    candidate.moduleSpecifier !== undefined &&
    typeof candidate.moduleSpecifier !== 'string'
  ) {
    return false
  }

  if (!Array.isArray(candidate.types)) {
    return false
  }

  for (const typeEntry of candidate.types) {
    if (!isObject(typeEntry)) {
      return false
    }

    const candidateType = typeEntry as {
      name?: unknown
      properties?: unknown
    }

    if (typeof candidateType.name !== 'string') {
      return false
    }

    if (
      candidateType.properties !== undefined &&
      (!Array.isArray(candidateType.properties) ||
        !candidateType.properties.every((property) => typeof property === 'string'))
    ) {
      return false
    }
  }

  return true
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object'
}

/**
 * Create a WebSocket server that improves the performance of renoun components and
 * utilities by processing type analysis and syntax highlighting in a separate process.
 */
export async function createServer(options?: { port?: number }) {
  const server = new WebSocketServer({ port: options?.port })
  const port = await server.getPort()
  activeProjectServers += 1

  process.env.RENOUN_SERVER_PORT = String(port)

  const rootDirectory = getRootDirectory()
  const rootWatcher = shouldEmitRefreshNotifications()
    ? watch(rootDirectory, { recursive: true }, (eventType, fileName) => {
        if (!fileName) return

        const filePath = join(rootDirectory, fileName)

        if (isFilePathGitIgnored(filePath)) {
          return
        }

        /* Notify the client to refresh when files change. */
        server.sendNotification({
          type: 'refresh',
          data: {
            eventType,
            filePath,
          },
        })
      })
    : undefined

  const originalCleanup = server.cleanup.bind(server)
  let cleanedUp = false
  server.cleanup = () => {
    if (cleanedUp) {
      return
    }
    cleanedUp = true

    if (rootWatcher) {
      closeWatcher(rootWatcher)
    }
    activeProjectServers = Math.max(0, activeProjectServers - 1)
    if (activeProjectServers === 0) {
      disposeProjectWatchers()
    }

    originalCleanup()
  }

  server.registerMethod(
    'getSourceTextMetadata',
    async function getSourceTextMetadata({
      projectOptions,
      ...options
    }: GetSourceTextMetadataOptions & {
      projectOptions?: ProjectOptions
    }) {
      const project = getProject(projectOptions)

      return baseGetSourceTextMetadata({
        ...options,
        project,
      })
    },
    {
      memoize: true,
      concurrency: 10,
    }
  )

  server.registerMethod(
    'getTokens',
    async function getTokens({
      projectOptions,
      ...options
    }: GetTokensOptions & {
      projectOptions?: ProjectOptions
      languages?: ConfigurationOptions['languages']
    }) {
      const project = getProject(projectOptions)

      if (currentHighlighter === null) {
        currentHighlighter = createHighlighter({
          theme: options.theme,
          languages: options.languages,
        })
      }

      const highlighter = await currentHighlighter

      return baseGetTokens({
        ...options,
        highlighter,
        project,
      })
    },
    {
      memoize: true,
      concurrency: 10,
    }
  )

  server.registerMethod(
    'resolveTypeAtLocationWithDependencies',
    async function resolveTypeAtLocationWithDependencies({
      projectOptions,
      filter,
      ...options
    }: ResolveTypeAtLocationRpcRequest) {
      return getDebugLogger().trackOperation(
        'server.resolveTypeAtLocationWithDependencies',
        async () => {
          const project = getProject(projectOptions)

          getDebugLogger().info('Processing type resolution request', () => ({
            data: {
              filePath: options.filePath,
              position: options.position,
              kind: SyntaxKind[options.kind],
              useInMemoryFileSystem: projectOptions?.useInMemoryFileSystem,
            },
          }))

          return baseResolveTypeAtLocationWithDependencies(
            project,
            options.filePath,
            options.position,
            options.kind,
            parseTypeFilter(filter),
            projectOptions?.useInMemoryFileSystem
          )
        },
        {
          data: {
            filePath: options.filePath,
            position: options.position,
            kind: SyntaxKind[options.kind],
          },
        }
      )
    },
    {
      memoize: false,
      concurrency: 3,
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
      return getCachedFileExports(project, filePath)
    },
    {
      memoize: false,
      concurrency: 25,
    }
  )

  server.registerMethod(
    'getOutlineRanges',
    async function getOutlineRanges({
      filePath,
      projectOptions,
    }: {
      filePath: string
      projectOptions?: ProjectOptions
    }) {
      const project = getProject(projectOptions)
      return getCachedOutlineRanges(project, filePath)
    },
    {
      memoize: false,
      concurrency: 25,
    }
  )

  server.registerMethod(
    'getFileExportMetadata',
    async function getFileExportMetadata({
      name,
      filePath,
      position,
      kind,
      projectOptions,
    }: {
      name: string
      filePath: string
      position: number
      kind: TsMorphSyntaxKind
      projectOptions?: ProjectOptions
    }) {
      const project = getProject(projectOptions)
      return getCachedFileExportMetadata(project, {
        name,
        filePath,
        position,
        kind,
      })
    },
    {
      memoize: false,
      concurrency: 25,
    }
  )

  server.registerMethod(
    'getFileExportText',
    async function getFileExportText({
      filePath,
      position,
      kind,
      includeDependencies,
      projectOptions,
    }: {
      filePath: string
      position: number
      kind: TsMorphSyntaxKind
      includeDependencies?: boolean
      projectOptions?: ProjectOptions
    }) {
      const project = getProject(projectOptions)
      return baseGetFileExportText({
        filePath,
        position,
        kind,
        includeDependencies,
        project,
      })
    },
    {
      memoize: false,
      concurrency: 25,
    }
  )

  server.registerMethod(
    'getFileExportStaticValue',
    async function getFileExportStaticValue({
      filePath,
      position,
      kind,
      projectOptions,
    }: {
      filePath: string
      position: number
      kind: TsMorphSyntaxKind
      projectOptions?: ProjectOptions
    }) {
      const project = getProject(projectOptions)
      return getCachedFileExportStaticValue(project, {
        filePath,
        position,
        kind,
      })
    },
    {
      memoize: false,
      concurrency: 25,
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
      invalidateProjectFileCache(project, filePath)
    },
    {
      memoize: false,
      concurrency: 1,
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
      return transpileCachedSourceFile(project, filePath)
    },
    {
      memoize: false,
      concurrency: 25,
    }
  )

  return server
}

function closeWatcher(watcher: FSWatcher): void {
  try {
    watcher.close()
  } catch {
    // Ignore watcher close errors during server shutdown.
  }
}

function shouldEmitRefreshNotifications(): boolean {
  const override = parseBooleanEnv(process.env.RENOUN_SERVER_REFRESH_NOTIFICATIONS)
  if (override !== undefined) {
    return override
  }

  return true
}

function parseBooleanEnv(value: string | undefined): boolean | undefined {
  if (value === undefined) {
    return undefined
  }

  const normalized = value.trim().toLowerCase()
  if (normalized === '1' || normalized === 'true') {
    return true
  }

  if (normalized === '0' || normalized === 'false') {
    return false
  }

  return undefined
}
