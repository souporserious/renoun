import React, { cache } from 'react'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { isAbsolute, dirname, join, posix as pathPosix } from 'node:path'

import { svgToJsx } from '../utils/svg-to-jsx.js'
import { getConfig } from './Config/ServerConfigContext.js'
import type { SourcesConfig } from './Config/types.js'

const FIGMA_PROTOCOL = /^figma:/i
const HTTP_PROTOCOL = /^(https?:)/i
interface FigmaCacheLocation {
  directory: string
  publicBasePath: string
}

function renderCachedFigmaImage(
  cached: CachedFigmaImage,
  props: React.ComponentProps<'img'>,
  description?: string
): React.ReactElement {
  if (cached.format === 'svg') {
    return svgToJsx(cached.svg, {
      rootProps: {
        ...props,
        role: props.role ?? 'img',
        'aria-label': description ?? undefined,
      },
    })
  }

  return <img {...props} src={cached.publicPath} alt={description ?? ''} />
}

type CachedFigmaImage =
  | {
      format: 'svg'
      svg: string
      publicPath: string
    }
  | {
      format: 'png' | 'jpg'
      publicPath: string
    }

interface RemoteComponentMeta {
  node_id: string
  name: string
  description?: string | null
  containing_frame?: { name?: string | null }
  containing_page?: { name?: string | null }
}

interface ComponentMetadata {
  nodeId: string
  name: string
  description?: string
  pageName?: string
  frameName?: string
}

function getFigmaCacheKey(input: {
  fileId: string
  selector: string
  options: Omit<FigmaImageOptions, 'format'>
  version?: string
}): string {
  const hash = createHash('sha256')
  hash.update(
    JSON.stringify({
      fileId: input.fileId,
      selector: input.selector,
      options: input.options,
      version: input.version,
    })
  )
  return hash.digest('hex')
}

function slugifyForFileName(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // non-alphanum → '-'

  let start = 0
  let end = normalized.length

  // 45 === '-'
  while (start < end && normalized.charCodeAt(start) === 45) start++
  while (end > start && normalized.charCodeAt(end - 1) === 45) end--

  return normalized.slice(start, end).slice(0, 80)
}

function slugifyNodeId(nodeId: string): string {
  // 123:456 → 123-456; keep it short/readable
  return slugifyForFileName(nodeId.replace(/:/g, '-'))
}

function buildScaleSuffix(scale?: number): string {
  if (scale === undefined || !Number.isFinite(scale) || scale === 1) {
    return ''
  }

  const number = Number(scale)
  if (!Number.isFinite(number) || number <= 0) {
    return ''
  }

  const scaleString = Number.isInteger(number)
    ? String(number)
    : number.toString().replace('.', '_')

  return `@${scaleString}x`
}

function getFigmaExportBasename(options?: {
  label?: string
  nodeId?: string
  scale?: number
}): { dirSegments: string[]; baseName: string } {
  let rawSegments: string[] = []

  if (options?.label && options.label.trim()) {
    // e.g. "Page/Frame/Component" → ["Page", "Frame", "Component"]
    rawSegments = options.label
      .split('/')
      .map((s) => s.trim())
      .filter(Boolean)
  } else if (options?.nodeId) {
    // Fallback when we don't have a nice label yet
    rawSegments = [`node-${slugifyNodeId(options.nodeId)}`]
  }

  if (rawSegments.length === 0) {
    rawSegments = ['figma-image']
  }

  const slugged = rawSegments.map((segment) => slugifyForFileName(segment))
  const dirSegments = slugged.slice(0, -1)
  const last = slugged[slugged.length - 1] || 'figma-image'

  const scaleSuffix = buildScaleSuffix(options?.scale)
  const baseName = `${last}${scaleSuffix}`

  return { dirSegments, baseName }
}

type Format = 'svg' | 'png' | 'jpg'

function getCachedFigmaPaths(
  key: string,
  format: Format,
  cacheLocation: FigmaCacheLocation,
  options?: { label?: string; nodeId?: string; scale?: number }
) {
  const { dirSegments, baseName } = getFigmaExportBasename(options)
  const fileName = `${baseName}.${format}`

  // Filesystem path: <cacheDir>[/segments...]/fileName
  const fileSystemPath = join(cacheLocation.directory, ...dirSegments, fileName)

  // Public path: <publicBasePath>[/segments...]/fileName
  const publicBaseDir =
    dirSegments.length > 0
      ? pathPosix.join(cacheLocation.publicBasePath, ...dirSegments)
      : cacheLocation.publicBasePath

  const publicPathWithoutQuery = pathPosix.join(publicBaseDir, fileName)

  // Use hash only as cache-busting query param, not in the filename
  const shortHash = key.slice(0, 8)
  const publicPath =
    shortHash.length > 0
      ? `${publicPathWithoutQuery}?v=${encodeURIComponent(shortHash)}`
      : publicPathWithoutQuery

  return {
    baseName,
    fileName,
    fileSystemPath,
    publicPath,
  }
}

function resolveFigmaCacheLocation(
  configuredPath: string | undefined
): FigmaCacheLocation {
  const rawPath = configuredPath ?? join('public', 'images')
  const normalized = trimTrailingSlashes(rawPath.replace(/\\/g, '/'))
  const segments = normalized.split('/').filter(Boolean)
  const publicSegments =
    segments[0] === 'public' ? segments.slice(1) : [...segments]
  const publicBasePath =
    publicSegments.length > 0 ? `/${pathPosix.join(...publicSegments)}` : '/'

  const directory = isAbsolute(rawPath) ? rawPath : join(process.cwd(), rawPath)

  return {
    directory,
    publicBasePath,
  }
}

async function readCachedFigmaImage(
  key: string,
  cacheLocation: FigmaCacheLocation,
  options?: { label?: string; nodeId?: string; scale?: number }
): Promise<CachedFigmaImage | null> {
  const formats: Array<CachedFigmaImage['format']> = ['svg', 'png', 'jpg']
  for (const format of formats) {
    const { fileSystemPath, publicPath } = getCachedFigmaPaths(
      key,
      format,
      cacheLocation,
      options
    )
    try {
      if (format === 'svg') {
        const svg = await readFile(fileSystemPath, 'utf8')
        return { format, svg, publicPath }
      }
      await readFile(fileSystemPath)
      return { format, publicPath }
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
        if (process.env.RENOUN_DEBUG === 'debug') {
          console.debug('[renoun] Failed to read figma cache', error)
        }
      }
    }
  }
  return null
}

async function writeFigmaCacheFile(
  key: string,
  format: Format,
  content: string | ArrayBuffer,
  cacheLocation: FigmaCacheLocation,
  options?: { label?: string; nodeId?: string; scale?: number }
): Promise<{ publicPath: string }> {
  const { fileSystemPath, publicPath } = getCachedFigmaPaths(
    key,
    format,
    cacheLocation,
    options
  )

  // Ensure the nested directory structure exists
  await mkdir(dirname(fileSystemPath), { recursive: true })

  await writeFile(
    fileSystemPath,
    typeof content === 'string' ? content : Buffer.from(content)
  )

  return { publicPath }
}

type FigmaScope = 'images' | 'components' | 'fileContent' | 'fileMeta'

const rateLimitUntil: Partial<Record<FigmaScope, number>> = {}

function isRateLimited(scope: FigmaScope): boolean {
  const until = rateLimitUntil[scope]
  return typeof until === 'number' && until > Date.now()
}

function markRateLimited(scope: FigmaScope, response: Response) {
  const header = response.headers.get('Retry-After')?.trim()
  const seconds = header && !Number.isNaN(Number(header)) ? Number(header) : 60
  rateLimitUntil[scope] = Date.now() + Math.max(seconds, 1) * 1000
}

async function fetchWithRateLimit(
  scope: FigmaScope,
  url: URL,
  token: string
): Promise<Response> {
  if (isRateLimited(scope)) {
    throw new Error(
      `[renoun] Figma ${scope} endpoint is temporarily rate-limited. ` +
        'Serving previously cached images only for now.'
    )
  }

  const response = await fetch(url, {
    headers: { 'X-Figma-Token': token },
  })

  if (response.status === 429) {
    markRateLimited(scope, response)
  }

  return response
}

interface FigmaFileMetaPayload {
  file?: {
    name?: string
    folder_name?: string
    last_touched_at?: string
    version?: string
  }
}

const fetchFigmaFileMeta = cache(
  async (fileId: string, token: string): Promise<FigmaFileMetaPayload> => {
    const url = new URL(`https://api.figma.com/v1/files/${fileId}/meta`)
    const response = await fetchWithRateLimit('fileMeta', url, token)

    // file metadata needs file_metadata:read
    if (!response.ok) {
      throw createFigmaError('fileMeta', response)
    }

    return (await response.json()) as FigmaFileMetaPayload
  }
)

type ImageBatchKey = `${string}|${string}` // `${fileId}|${queryKey}`

interface ImageBatch {
  nodeIds: string[]
  resolvers: Array<(urls: Record<string, string | null>) => void>
  rejecters: Array<(err: unknown) => void>
  scheduled: boolean
}

function createFigmaImageLoader(token: string) {
  const batches = new Map<ImageBatchKey, ImageBatch>()

  function schedule(batchKey: ImageBatchKey) {
    const batch = batches.get(batchKey)
    if (!batch || batch.scheduled) return
    batch.scheduled = true

    queueMicrotask(async () => {
      const current = batches.get(batchKey)
      if (!current) return
      batches.delete(batchKey)

      const [fileId, queryKey] = batchKey.split('|')
      const searchParams = new URLSearchParams(queryKey)
      // Dedupe node ids
      searchParams.set('ids', Array.from(new Set(current.nodeIds)).join(','))

      const url = new URL(`https://api.figma.com/v1/images/${fileId}`)
      url.search = searchParams.toString()

      let response: Response
      try {
        response = await fetchWithRateLimit('images', url, token)
      } catch (error) {
        current.rejecters.forEach((reject) => reject(error))
        return
      }

      if (!response.ok) {
        const text = await response.text().catch(() => '')
        const err = createFigmaError('images', response, text || undefined)
        current.rejecters.forEach((reject) => reject(err))
        return
      }

      const payload = (await response.json()) as {
        err: string | null
        images: Record<string, string | null>
      }

      if (payload.err) {
        const err = new Error(
          `[renoun] Figma API responded with an error: ${payload.err}`
        )
        current.rejecters.forEach((reject) => reject(err))
        return
      }

      current.resolvers.forEach((resolve) => resolve(payload.images))
    })
  }

  function load(
    fileId: string,
    nodeId: string,
    queryKey: string
  ): Promise<string> {
    const batchKey: ImageBatchKey = `${fileId}|${queryKey}`
    let batch = batches.get(batchKey)
    if (!batch) {
      batch = {
        nodeIds: [],
        resolvers: [],
        rejecters: [],
        scheduled: false,
      }
      batches.set(batchKey, batch)
    }

    return new Promise<string>((resolve, reject) => {
      batch!.nodeIds.push(nodeId)
      batch!.resolvers.push((urls) => {
        const url = urls[nodeId]
        if (!url) {
          reject(
            new Error(`[renoun] Figma returned no image for node ${nodeId}.`)
          )
        } else {
          resolve(url)
        }
      })
      batch!.rejecters.push(reject)
      schedule(batchKey)
    })
  }

  return { load }
}

const getFigmaImageLoader = cache((token: string) =>
  createFigmaImageLoader(token)
)

const fetchFigmaImageUrl = cache(
  async (
    fileId: string,
    nodeId: string,
    queryKey: string,
    token: string
  ): Promise<string> => {
    const loader = getFigmaImageLoader(token)
    return loader.load(fileId, nodeId, queryKey)
  }
)

const fetchFigmaComponents = cache(
  async (fileId: string, token: string): Promise<ComponentMetadata[]> => {
    const url = new URL(`https://api.figma.com/v1/files/${fileId}/components`)
    const response = await fetchWithRateLimit('components', url, token)

    // components needs library_content:read
    if (!response.ok) {
      throw createFigmaError('components', response)
    }

    const payload = (await response.json()) as {
      meta?: { components?: RemoteComponentMeta[] }
    }

    const components = payload.meta?.components ?? []

    return components.map((component) => ({
      nodeId: component.node_id,
      name: component.name,
      description: component.description ?? undefined,
      pageName: component.containing_page?.name ?? undefined,
      frameName: component.containing_frame?.name ?? undefined,
    }))
  }
)

type FigmaNodeType = 'FRAME' | 'COMPONENT' | 'COMPONENT_SET' | string

interface FigmaNode {
  id: string
  name: string
  type: FigmaNodeType
  children?: FigmaNode[]
}

interface FigmaFilePayload {
  document: FigmaNode
  lastModified?: string
  version?: string
}

const fetchFigmaFile = cache(
  async (fileId: string, token: string): Promise<FigmaFilePayload> => {
    const url = new URL(`https://api.figma.com/v1/files/${fileId}`)
    const response = await fetchWithRateLimit('fileContent', url, token)

    // file JSON needs file_content:read
    if (!response.ok) {
      throw createFigmaError('fileContent', response)
    }

    const payload = (await response.json()) as FigmaFilePayload
    return payload
  }
)

async function getFigmaFileVersion(
  fileId: string,
  token: string
): Promise<string | undefined> {
  try {
    const meta = await fetchFigmaFileMeta(fileId, token)
    const file = meta.file
    if (!file) return undefined

    // Prefer explicit version, fall back to last_touched_at
    return file.version ?? file.last_touched_at
  } catch (error) {
    if (process.env.RENOUN_DEBUG === 'debug') {
      console.debug('[renoun] Skipping Figma version lookup (meta):', error)
    }
    return undefined
  }
}

function isExportableNodeType(type: FigmaNodeType): boolean {
  // Only allow nodes we explicitly want to match by name within the SAME file.
  // Excludes INSTANCE and other node types that may reference external libraries.
  return type === 'FRAME' || type === 'COMPONENT' || type === 'COMPONENT_SET'
}

interface NamedNode {
  id: string
  name: string
  pageName?: string
  frameName?: string
  fullPath: string
  type: FigmaNodeType
}

function collectNamedNodes(
  node: FigmaNode,
  path: string[] = [],
  context: { pageName?: string; frameName?: string } = {}
): NamedNode[] {
  const results: NamedNode[] = []
  const nextPath = [...path, node.name]

  let pageName = context.pageName
  let frameName = context.frameName

  // Infer page/frame context based on node.type & depth
  if (node.type === 'PAGE') {
    pageName = node.name
    frameName = undefined
  } else if (node.type === 'FRAME' || node.type === 'COMPONENT_SET') {
    // Treat FRAME / COMPONENT_SET as the "frame scope"
    frameName = node.name
  }

  if (isExportableNodeType(node.type)) {
    results.push({
      id: node.id,
      name: node.name,
      pageName,
      frameName,
      fullPath: nextPath.join('/'),
      type: node.type,
    })
  }

  if (node.children && node.children.length > 0) {
    for (const child of node.children) {
      results.push(
        ...collectNamedNodes(child, nextPath, { pageName, frameName })
      )
    }
  }

  return results
}

function isLikelyFileId(value: string): boolean {
  return /^[A-Za-z0-9]{10,}$/.test(value)
}

function trimLeadingAndTrailingSlashes(value: string): string {
  let start = 0
  let end = value.length
  // 47 is '/'
  while (start < end && value.charCodeAt(start) === 47) start++
  while (end > start && value.charCodeAt(end - 1) === 47) end--
  return value.slice(start, end)
}

function trimTrailingSlashes(value: string): string {
  let end = value.length
  while (end > 0 && value.charCodeAt(end - 1) === 47) end--
  return value.slice(0, end)
}

function buildCacheLabel(
  selector: string,
  alias?: string,
  basePathname?: string
): string {
  const normalizedAlias = alias?.trim()
  const normalizedBasePathname = basePathname?.trim()

  const aliasSegments = normalizedAlias
    ? normalizedAlias.split('/').map((segment) => segment.trim()).filter(Boolean)
    : []

  const basePathSegments = normalizedBasePathname
    ? normalizedBasePathname
        .split('/')
        .map((segment) => segment.trim())
        .filter(Boolean)
    : []

  const selectorSegments = selector
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)

  const startsWithBasePath =
    basePathSegments.length > 0 &&
    basePathSegments.every(
      (segment, index) => selectorSegments[index] === segment
    )

  const segments: string[] = []
  if (aliasSegments.length > 0) {
    segments.push(...aliasSegments)
  }
  if (basePathSegments.length > 0 && !startsWithBasePath) {
    segments.push(...basePathSegments)
  }
  segments.push(...selectorSegments)

  return segments.length > 0 ? segments.join('/') : 'figma-image'
}

function parseFigmaProtocol(
  rawSource: string,
  sources: SourcesConfig | undefined
): { fileId: string; selector: string; basePathname?: string; alias?: string } {
  const value = rawSource.slice('figma:'.length)
  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error(
      '[renoun] figma: sources must include a file id and component selector.'
    )
  }

  const slashIndex = trimmed.indexOf('/')
  if (slashIndex === -1) {
    throw new Error(
      `[renoun] figma: sources must include a file id (or configured source) and selector (e.g. figma:FILE_ID/ComponentName). Received ${rawSource}.`
    )
  }

  const alias = trimmed.slice(0, slashIndex).trim()
  const rawSelector = trimmed.slice(slashIndex + 1)
  const selector = trimLeadingAndTrailingSlashes(rawSelector.trim())

  if (!selector) {
    throw new Error(
      `[renoun] figma: sources must include a component or frame name after the alias. Received ${rawSource}.`
    )
  }

  if (isLikelyNodeId(selector)) {
    throw new Error(
      `[renoun] figma: frame or component ids (e.g. "1:1379") are not supported. Provide the component or frame name instead. Received ${rawSource}.`
    )
  }

  let fileId: string
  let basePathname: string | undefined
  let aliasValue: string | undefined

  if (alias && isLikelyFileId(alias)) {
    fileId = alias
  } else if (alias && sources && alias in sources) {
    fileId = sources[alias].fileId
    basePathname = sources[alias].basePathname
    aliasValue = alias
  } else if (!alias) {
    throw new Error(
      '[renoun] figma: requires a file id (e.g. figma:FILE_ID/ComponentName).'
    )
  } else {
    throw new Error(
      `[renoun] figma: unknown file alias "${alias}". Define a custom source on <RootProvider sources={{ ${alias}: { type: 'figma', fileId: 'FILE_ID' } }} /> and reference it like ${alias}:ComponentName or figma:${alias}/ComponentName.`
    )
  }

  return {
    fileId,
    selector,
    basePathname,
    alias: aliasValue,
  }
}

function parseCustomSource(
  source: string,
  sources: SourcesConfig | undefined
): {
  fileId: string
  selector: string
  basePathname?: string
  alias?: string
} | null {
  const match = /^([a-zA-Z][a-zA-Z0-9+.-]*):(.*)$/.exec(source)
  if (!match) {
    return null
  }
  const scheme = match[1]
  if (HTTP_PROTOCOL.test(scheme + ':') || /^figma$/i.test(scheme)) {
    return null
  }
  const definition = sources?.[scheme]
  // Allow common pass-through URL schemes to continue without requiring a custom source
  const passThroughSchemes = new Set(['data', 'blob', 'file'])
  if (!definition) {
    if (passThroughSchemes.has(scheme.toLowerCase())) {
      return null
    }
    // Unknown scheme – guide the user to configure RootProvider or correct formatting
    throw new Error(
      `[renoun] Unknown image source scheme "${scheme}".\n\n` +
        'How to fix:\n' +
        `- Define it on <RootProvider sources={{ ${scheme}: { type: 'figma', fileId: 'FILE_ID' } }} /> and reference nodes like "${scheme}:Page/Frame/Component".\n` +
        '- Or use one of the supported forms:\n' +
        '  • figma:FILE_ID/ComponentName\n' +
        `Received: ${source}`
    )
  }
  if (definition['type'] === 'figma') {
    const selector = trimLeadingAndTrailingSlashes(match[2].trim())
    if (!selector) {
      throw new Error(
        `[renoun] ${scheme}: sources must include a component or frame name.`
      )
    }
    if (isLikelyNodeId(selector)) {
      throw new Error(
        `[renoun] ${scheme}: frame or component ids (e.g. "1:1379") are not supported. Provide the component or frame name instead.`
      )
    }
    return {
      fileId: definition['fileId'],
      selector,
      basePathname: definition['basePathname'],
      alias: scheme,
    }
  }
  // If a custom source is configured but not supported by <Image />, provide a clear error
  throw new Error(
    `[renoun] The "${scheme}" source is configured with unsupported type "${String(
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      (definition as unknown as Record<string, unknown>)['type']
    )}". <Image /> currently supports only { type: 'figma' } sources.`
  )
}

function isLikelyNodeId(value: string): boolean {
  return /^[0-9:-]+$/.test(value.trim())
}

function namesEqual(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

// matchFigmaPathPrefix moved to ./Image/utils.ts

function matchesSelector(
  component: ComponentMetadata,
  selector: string
): boolean {
  if (component.name === selector) {
    return true
  }

  const segments = selector.split('/').filter(Boolean)
  if (segments.length === 0) {
    return false
  }

  const componentName = segments[segments.length - 1]
  if (!namesEqual(componentName, component.name)) {
    return false
  }

  const scope = segments.slice(0, -1).join('/')
  if (!scope) {
    return false
  }

  const possibilities = new Set<string>()
  if (component.pageName) {
    possibilities.add(component.pageName)
  }
  if (component.frameName) {
    possibilities.add(component.frameName)
  }
  if (component.pageName && component.frameName) {
    possibilities.add(`${component.pageName}/${component.frameName}`)
  }

  return possibilities.has(scope)
}

async function resolveComponentBySelector(
  fileId: string,
  selector: string,
  token: string
): Promise<ComponentMetadata | null> {
  const trimmed = selector.trim()
  if (!trimmed) {
    return null
  }

  // First try: components endpoint (fast, includes description metadata)
  const components = await fetchFigmaComponents(fileId, token)
  const exactMatches = components.filter((component) =>
    namesEqual(component.name, trimmed)
  )

  if (exactMatches.length === 1) {
    return exactMatches[0]
  }

  if (exactMatches.length > 1) {
    throw new Error(
      `[renoun] Multiple components share the name "${trimmed}" in file ${fileId}. ` +
        'Provide the containing page or frame as part of the selector (e.g. page/component).'
    )
  }

  const scopedMatches = components.filter((component) =>
    matchesSelector(component, trimmed)
  )

  if (scopedMatches.length === 1) {
    return scopedMatches[0]
  }

  if (scopedMatches.length > 1) {
    throw new Error(
      `[renoun] The selector "${trimmed}" is ambiguous in file ${fileId}. ` +
        'Refine it by including both the page and frame names (e.g. page/frame/component).'
    )
  }

  // Second try: crawl the file and match exportable nodes (frames/components) by name
  const file = await fetchFigmaFile(fileId, token)
  const nodes = collectNamedNodes(file.document)
  const componentNameSet = new Set(
    components.map((component) => component.name.trim().toLowerCase())
  )

  // Prefer components in the crawl as well
  const fromFileExactComponent = nodes.find(
    (node) =>
      namesEqual(node.name, trimmed) &&
      (node.type === 'COMPONENT' || node.type === 'COMPONENT_SET')
  )
  if (fromFileExactComponent) {
    return {
      nodeId: fromFileExactComponent.id,
      name: fromFileExactComponent.name,
      description: undefined,
      pageName: fromFileExactComponent.pageName,
      frameName: fromFileExactComponent.frameName,
    }
  }

  const fromFileExact = nodes.find((node) => namesEqual(node.name, trimmed))
  if (
    fromFileExact &&
    !componentNameSet.has(fromFileExact.name.trim().toLowerCase())
  ) {
    return {
      nodeId: fromFileExact.id,
      name: fromFileExact.name,
      description: undefined,
      pageName: fromFileExact.pageName,
      frameName: fromFileExact.frameName,
    }
  }

  const fromFileScopedComponent = nodes.find(
    (node) =>
      (node.type === 'COMPONENT' || node.type === 'COMPONENT_SET') &&
      matchesSelector(
        {
          nodeId: node.id,
          name: node.name,
          description: undefined,
          pageName: node.pageName,
          frameName: node.frameName,
        },
        trimmed
      )
  )
  if (fromFileScopedComponent) {
    return {
      nodeId: fromFileScopedComponent.id,
      name: fromFileScopedComponent.name,
      description: undefined,
      pageName: fromFileScopedComponent.pageName,
      frameName: fromFileScopedComponent.frameName,
    }
  }

  const fromFileScoped = nodes.find((n) =>
    matchesSelector(
      {
        nodeId: n.id,
        name: n.name,
        description: undefined,
        pageName: n.pageName,
        frameName: n.frameName,
      },
      trimmed
    )
  )
  if (
    fromFileScoped &&
    !componentNameSet.has(fromFileScoped.name.trim().toLowerCase())
  ) {
    return {
      nodeId: fromFileScoped.id,
      name: fromFileScoped.name,
      description: undefined,
      pageName: fromFileScoped.pageName,
      frameName: fromFileScoped.frameName,
    }
  }

  let suggestions = ''

  // Build a small list of similar names to help debug
  const sampleComponents = components
    .map((component) => component.name)
    .filter((name, index, array) => array.indexOf(name) === index)
    .filter((name) => name.toLowerCase().includes(trimmed.toLowerCase()))
    .slice(0, 8)
  if (sampleComponents.length > 0) {
    suggestions += `\nSimilar components: ${sampleComponents.join(', ')}`
  }
  throw new Error(
    `[renoun] Could not find a component or frame named "${trimmed}" in file "${fileId}".` +
      '\n- Ensure the name matches exactly (case-insensitive).\n' +
      '- If multiple nodes share a name, scope it with page/frame (e.g. Page/Frame/Node).' +
      suggestions
  )
}

type FigmaErrorScope = 'images' | 'components' | 'fileContent' | 'fileMeta'

function createFigmaError(
  scope: FigmaErrorScope,
  response: Response,
  rawMessage?: string
): Error {
  const hints: string[] = []

  if (response.status === 401) {
    hints.push(
      'The FIGMA_TOKEN is missing or invalid. Ensure it is set correctly.'
    )
  } else if (response.status === 403) {
    const requiredScopesByScope: Record<FigmaErrorScope, string[]> = {
      images: ['file_content:read'],
      fileContent: ['file_content:read'],
      fileMeta: ['file_metadata:read'],
      components: ['library_content:read'],
    }

    const requiredScopes = requiredScopesByScope[scope] ?? []

    hints.push('Access denied. Verify:')
    if (requiredScopes.length) {
      hints.push(
        ` - FIGMA_TOKEN includes scope(s): ${requiredScopes.join(', ')}`
      )
    }
    if (scope === 'components') {
      hints.push(
        ' - Add team library scopes if needed: team_library_content:read'
      )
    }
    hints.push(
      ' - The token owner can open the referenced file in Figma',
      ' - The file ID is correct and belongs to that account/org'
    )

    if (rawMessage) {
      // Try to pull "err" from JSON, otherwise fall back to string
      try {
        const parsed = JSON.parse(rawMessage) as { err?: string }
        if (parsed && typeof parsed.err === 'string') {
          rawMessage = parsed.err
        }
      } catch {
        // not JSON, keep original
      }
      hints.push(` - Figma error message: ${rawMessage}`)
    }
  } else if (response.status === 404) {
    hints.push('Not found. Double-check the file ID.')
  } else {
    const retryAfterHint = getRetryAfterHint(response)
    if (response.status === 429) {
      if (retryAfterHint) {
        hints.push('Rate limit reached.', retryAfterHint)
      } else {
        hints.push('Rate limit reached. Try again later.')
      }
    } else if (retryAfterHint) {
      hints.push(retryAfterHint)
    }
  }

  const suffix = hints.length ? `\n${hints.join('\n')}` : ''
  return new Error(
    `[renoun] Figma ${scope} request failed (${response.status}).${suffix}`
  )
}

function getErrorMessage(error: unknown): string | undefined {
  if (!error) {
    return undefined
  }
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === 'string') {
    return error
  }
  return String(error)
}

function buildFigmaQuery(
  nodeId: string,
  options: Pick<
    FigmaImageOptions,
    | 'format'
    | 'scale'
    | 'background'
    | 'useAbsoluteBounds'
    | 'svgOutlineText'
    | 'svgIncludeId'
    | 'svgIncludeNodeId'
    | 'svgSimplifyStroke'
  >
): URLSearchParams {
  const params = new URLSearchParams()
  params.set('ids', nodeId)

  if (options.format) {
    params.set('format', options.format)
  }

  if (options.scale !== undefined) {
    const numericScale = Number(options.scale)
    if (!Number.isFinite(numericScale) || numericScale <= 0) {
      throw new Error('[renoun] The <Image /> scale must be a positive number.')
    }
    params.set('scale', numericScale.toString())
  }

  if (options.background) {
    params.set('background', options.background)
  }

  if (options.useAbsoluteBounds) {
    params.set('use_absolute_bounds', 'true')
  }

  if (options.format === 'svg') {
    if (options.svgOutlineText !== undefined) {
      params.set('svg_outline_text', String(options.svgOutlineText))
    }
    if (options.svgIncludeId !== undefined) {
      params.set('svg_include_id', String(options.svgIncludeId))
    }
    if (options.svgIncludeNodeId !== undefined) {
      params.set('svg_include_node_id', String(options.svgIncludeNodeId))
    }
    if (options.svgSimplifyStroke !== undefined) {
      params.set('svg_simplify_stroke', String(options.svgSimplifyStroke))
    }
  }

  return params
}

type FigmaSource = `figma:${string}`

interface SharedImageProps
  extends Omit<React.ComponentProps<'img'>, 'alt' | 'src' | 'srcSet'> {
  /** Optional description for accessibility. */
  description?: string
}

interface FigmaSvgOptions {
  svgOutlineText?: boolean
  svgIncludeId?: boolean
  svgIncludeNodeId?: boolean
  svgSimplifyStroke?: boolean
}

interface FigmaImageOptions extends FigmaSvgOptions {
  /** Desired output format when rendering from Figma. Defaults to `png`. */
  format?: Format

  /** Resolution scale to request from Figma. */
  scale?: number

  /** Background color when requesting raster formats from Figma. */
  background?: string

  /** Whether to use the absolute bounding box when exporting from Figma. */
  useAbsoluteBounds?: boolean
}

interface NonFigmaImageOptions {
  format?: never
  scale?: never
  background?: never
  useAbsoluteBounds?: never
}

export type ImageProps<Source extends string = string> = SharedImageProps &
  (Source extends FigmaSource
    ? { source: Source } & FigmaImageOptions
    : { source: Source } & NonFigmaImageOptions)

async function getFigmaImageUrl(
  fileId: string,
  nodeId: string,
  baseOptions: Omit<FigmaImageOptions, 'format'>,
  token: string,
  preferredFormat?: Format
): Promise<{ url: string; format: Format }> {
  // If the caller specified a format, try that first
  if (preferredFormat) {
    const preferredParams = buildFigmaQuery(nodeId, {
      ...baseOptions,
      format: preferredFormat,
    })
    try {
      const preferredUrl = await fetchFigmaImageUrl(
        fileId,
        nodeId,
        preferredParams.toString(),
        token
      )
      return { url: preferredUrl, format: preferredFormat }
    } catch {
      // fall through
    }
  }

  // Try SVG then raster, no probe
  let originalError: unknown = null
  const svgParams = buildFigmaQuery(nodeId, { ...baseOptions, format: 'svg' })
  try {
    const svgUrl = await fetchFigmaImageUrl(
      fileId,
      nodeId,
      svgParams.toString(),
      token
    )
    return { url: svgUrl, format: 'svg' }
  } catch (error) {
    originalError = error
  }

  const rasterFormat: 'png' | 'jpg' = preferredFormat === 'jpg' ? 'jpg' : 'png'
  const rasterParams = buildFigmaQuery(nodeId, {
    ...baseOptions,
    format: rasterFormat,
  })
  try {
    const rasterUrl = await fetchFigmaImageUrl(
      fileId,
      nodeId,
      rasterParams.toString(),
      token
    )
    return { url: rasterUrl, format: rasterFormat }
  } catch (rasterError) {
    if (originalError instanceof Error) throw originalError
    throw rasterError
  }
}

/** Display images from Figma files, URLs, or local assets. */
export async function Image<Source extends string>({
  source,
  format = 'png',
  scale,
  background,
  useAbsoluteBounds,
  description,
  ...props
}: ImageProps<Source>): Promise<React.ReactElement> {
  const trimmedSource = source.trim()

  if (!trimmedSource) {
    throw new Error('[renoun] <Image /> requires a non-empty source.')
  }

  const isFigmaProtocol = FIGMA_PROTOCOL.test(trimmedSource)

  const config = await getConfig()
  const userSources = config.sources
  const cacheLocation = resolveFigmaCacheLocation(
    config.images!.outputDirectory
  )

  let fileId: string
  let resolvedDescription: string | undefined

  let matched: {
    fileId: string
    selector: string
    basePathname?: string
    alias?: string
  } | null = null
  let matchedBasePathname: string | undefined

  const custom = parseCustomSource(trimmedSource, userSources)
  if (custom) {
    matched = {
      fileId: custom.fileId,
      selector: custom.selector,
      basePathname: custom.basePathname,
      alias: custom.alias,
    }
    matchedBasePathname = custom.basePathname
  } else if (isFigmaProtocol) {
    matched = parseFigmaProtocol(trimmedSource, userSources)
    matchedBasePathname = matched.basePathname
  }

  // Non-figma sources → passthrough <img>
  if (!matched) {
    return React.createElement('img', {
      ...props,
      src: trimmedSource,
      alt: description ?? '',
    })
  }

  const token = process.env['FIGMA_TOKEN']
  if (!token) {
    const isProduction = process.env.NODE_ENV === 'production'
    const lines: string[] = [
      '[renoun] a FIGMA_TOKEN environment variable is required to load images from Figma.\n',
      'How to fix:',
      '1) In the Figma app, go to Main menu → Help and account → Account settings → Security → Personal access tokens, click "Generate new token", then copy it (see https://www.figma.com/developers/api#access-tokens).',
      '   Required scopes: file_content:read',
    ]

    if (!isProduction) {
      lines.push(
        '2) For local development, create a ".env.local" file at the project root with:',
        '   FIGMA_TOKEN=YOUR_TOKEN',
        '3) Restart your dev server so the env var is picked up.'
      )
      lines.push(
        '',
        'When deploying to production:',
        '   - Vercel (Dashboard): Project → Settings → Environment Variables',
        '   - Vercel (CLI): run "vercel env add FIGMA_TOKEN" (and optionally "vercel env pull .env.local" to sync locally)',
        '   - Netlify (Dashboard): Site configuration → Environment variables',
        '   - Netlify (CLI): run "netlify env:set FIGMA_TOKEN YOUR_TOKEN"',
        '   - Amplify: App settings → Environment variables'
      )
    } else {
      lines.push(
        '2) Set it as the FIGMA_TOKEN environment variable in your hosting provider, then redeploy:',
        '   - Vercel (Dashboard): Project → Settings → Environment Variables',
        '   - Vercel (CLI): run "vercel env add FIGMA_TOKEN"',
        '   - Netlify (Dashboard): Site configuration → Environment variables',
        '   - Netlify (CLI): run "netlify env:set FIGMA_TOKEN YOUR_TOKEN"',
        '   - Amplify: App settings → Environment variables'
      )
    }

    lines.push(
      '\nSee the <Image /> docs for more details: https://renoun.dev/components/image'
    )

    throw new Error(lines.join('\n'))
  }

  const { fileId: matchedFileId, selector, alias } = matched
  fileId = matchedFileId

  const cacheLabel = buildCacheLabel(selector, alias, matchedBasePathname)
  const cacheOptions = { label: cacheLabel, scale }

  const figmaOptions = {
    scale,
    background,
    useAbsoluteBounds,
    svgOutlineText: false,
    svgIncludeId: false,
    svgIncludeNodeId: false,
    svgSimplifyStroke: true,
  } satisfies Omit<FigmaImageOptions, 'format'>

  const cacheKeyWithoutVersion = getFigmaCacheKey({
    fileId,
    selector: cacheLabel,
    options: figmaOptions,
  })

  const cachedImage = await readCachedFigmaImage(
    cacheKeyWithoutVersion,
    cacheLocation,
    cacheOptions
  )
  if (cachedImage) {
    return renderCachedFigmaImage(
      cachedImage,
      props,
      description ?? undefined
    )
  }

  // Resolve by selector (e.g. "mark") → node id + metadata
  const selectorCandidates: string[] = [selector]
  if (matchedBasePathname) {
    const full = `${trimTrailingSlashes(matchedBasePathname)}/${selector}`
    if (!selectorCandidates.includes(full)) {
      selectorCandidates.push(full)
    }
  }

  let component: ComponentMetadata | null = null
  let lastErrorMessage: string | undefined
  for (const candidate of selectorCandidates) {
    try {
      component = await resolveComponentBySelector(fileId, candidate, token)
      if (component) break
    } catch (error) {
      component = null
      lastErrorMessage = getErrorMessage(error)
    }
  }

  if (!component) {
    const detail = lastErrorMessage ? stripRenounPrefix(lastErrorMessage) : ''
    throw new Error(
      `[renoun] Unable to resolve "${selector}" in file "${fileId}".` +
        (detail ? `\n\nDetails:\n${detail}` : '')
    )
  }

  const resolvedNodeId = component.nodeId
  resolvedDescription = component.description?.trim() || undefined

  const fileVersion = await getFigmaFileVersion(fileId, token)
  const cacheKey = getFigmaCacheKey({
    fileId,
    selector: cacheLabel,
    options: figmaOptions,
    version: fileVersion,
  })


  // 6) Optionally enrich description if still missing
  if (!resolvedDescription && description === undefined) {
    try {
      const components = await fetchFigmaComponents(fileId, token)
      const metadata = components.find(
        (component) => component.nodeId === resolvedNodeId
      )
      resolvedDescription = metadata?.description?.trim() || undefined
    } catch (error) {
      if (process.env.RENOUN_DEBUG === 'debug') {
        // eslint-disable-next-line no-console
        console.debug('[renoun] Skipping component metadata fetch:', error)
      }
    }
  }

  // 7) Fetch from Figma and write to cache
  const { url: bestUrl, format: resolvedFormat } = await getFigmaImageUrl(
    fileId,
    resolvedNodeId,
    figmaOptions,
    token,
    format
  )

  if (resolvedFormat === 'svg') {
    try {
      const response = await fetch(bestUrl)
      if (response.ok) {
        const svgText = await response.text()
        await writeFigmaCacheFile(
          cacheKey,
          'svg',
          svgText,
          cacheLocation,
          cacheOptions
        )
        return svgToJsx(svgText, {
          rootProps: {
            ...props,
            role: props.role ?? 'img',
            'aria-label': description ?? resolvedDescription ?? undefined,
          },
        })
      }
    } catch {
      // fall through to raster fallback below
    }
  }

  try {
    const response = await fetch(bestUrl)
    if (response.ok) {
      const arrayBuffer = await response.arrayBuffer()
      const { publicPath } = await writeFigmaCacheFile(
        cacheKey,
        resolvedFormat,
        arrayBuffer,
        cacheLocation,
        cacheOptions
      )
      return (
        <img
          {...props}
          src={publicPath}
          alt={description ?? resolvedDescription ?? ''}
        />
      )
    }
  } catch {
    // fall through to remote fallback below
  }

  return (
    <img
      {...props}
      src={bestUrl}
      alt={description ?? resolvedDescription ?? ''}
    />
  )
}

function getRetryAfterHint(response: Response): string | undefined {
  const header = response.headers.get('Retry-After')?.trim()
  if (!header) {
    return undefined
  }

  const numericValue = Number(header)
  if (Number.isFinite(numericValue) && numericValue >= 0) {
    return `Retry after ${formatDuration(numericValue)}.`
  }

  const date = Date.parse(header)
  if (!Number.isNaN(date)) {
    const waitSeconds = Math.max(0, Math.ceil((date - Date.now()) / 1000))
    if (waitSeconds === 0) {
      return 'Retry after the next refresh.'
    }
    return `Retry after ${formatDuration(waitSeconds)}.`
  }

  return `Retry after "${header}".`
}

function formatDuration(seconds: number): string {
  const units = [
    { label: 'day', value: 86400 },
    { label: 'hour', value: 3600 },
    { label: 'minute', value: 60 },
    { label: 'second', value: 1 },
  ]

  let remaining = Math.floor(seconds)
  const parts: string[] = []

  for (const unit of units) {
    if (remaining <= 0) {
      break
    }
    const count = Math.floor(remaining / unit.value)
    if (count > 0) {
      const suffix = count === 1 ? '' : 's'
      parts.push(`${count} ${unit.label}${suffix}`)
      remaining -= count * unit.value
    }
  }

  if (parts.length === 0) {
    return '0 seconds'
  }

  const selected = parts.slice(0, 2)
  if (selected.length === 1) {
    return selected[0]
  }

  const last = selected[selected.length - 1]
  const leading = selected.slice(0, -1)
  return `${leading.join(', ')} and ${last}`
}

function stripRenounPrefix(message: string): string {
  return message
    .split('\n')
    .map((line) => line.replace(/^\s*\[renoun\]\s*/iu, '').trimEnd())
    .join('\n')
    .trim()
}
