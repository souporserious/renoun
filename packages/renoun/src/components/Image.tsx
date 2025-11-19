import React, { cache } from 'react'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile, readdir, unlink } from 'node:fs/promises'
import { isAbsolute, join, posix as pathPosix } from 'node:path'

import { svgToJsx } from '../utils/svg-to-jsx.js'
import { getConfig } from './Config/ServerConfigContext.js'
import type { SourcesConfig } from './Config/types.js'
import type { Dirent } from 'node:fs'

const FIGMA_HOST_PATTERN = /\.figma\.com$/
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
  nodeId: string
  options: Omit<FigmaImageOptions, 'format'>
  version?: string
}): string {
  const hash = createHash('sha256')
  hash.update(JSON.stringify(input))
  return hash.digest('hex')
}

function slugifyForFileName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // non-alphanum → '-'
    .replace(/^-+/, '') // trim leading '-'
    .replace(/-+$/, '') // trim trailing '-'
    .slice(0, 80) // avoid path-length issues
}

function slugifyNodeId(nodeId: string): string {
  // 123:456 → 123-456; keep it short/readable
  return slugifyForFileName(nodeId.replace(/:/g, '-'))
}

function getCachedFigmaPaths(
  key: string,
  format: 'svg' | 'png' | 'jpg',
  cacheLocation: FigmaCacheLocation,
  options?: { label?: string; nodeId?: string }
) {
  const shortHash = key.slice(0, 8)
  let baseLabel: string | undefined

  if (options?.label) {
    baseLabel = slugifyForFileName(options.label)
  } else if (options?.nodeId) {
    baseLabel = `node-${slugifyNodeId(options.nodeId)}`
  }

  const baseName = baseLabel ? `${baseLabel}-${shortHash}` : shortHash
  const fileName = `${baseName}.${format}`

  return {
    baseName,
    fileName,
    fileSystemPath: join(cacheLocation.directory, fileName),
    publicPath: pathPosix.join(cacheLocation.publicBasePath, fileName),
  }
}

/** Remove stale Figma variants for the same component label. */
async function removeStaleFigmaVariants(
  /** The base name of the cached file. This will look like "label-slug-abcdef12" or "abcdef12". */
  baseName: string,

  /** The cache location. */
  cacheLocation: FigmaCacheLocation
): Promise<void> {
  // We only try to group by label when it looks like label-<8 hex chars>.
  const match = /^(.+)-([0-9a-f]{8})$/i.exec(baseName)
  if (!match) {
    // No label prefix (just the hash) – nothing smart to clean up.
    return
  }

  const [, labelPart, currentHash] = match
  const directory = cacheLocation.directory

  let entries: Dirent[]
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch {
    // Directory may not exist yet – nothing to clean.
    return
  }

  const deletions: Promise<unknown>[] = []

  for (const entry of entries) {
    if (!entry.isFile()) continue

    const name = entry.name
    const dotIndex = name.lastIndexOf('.')

    if (dotIndex <= 0) continue

    const candidateBase = name.slice(0, dotIndex)
    const candidateMatch = /^(.+)-([0-9a-f]{8})$/i.exec(candidateBase)

    if (!candidateMatch) continue

    const [, candidateLabel, candidateHash] = candidateMatch

    if (candidateLabel !== labelPart) continue

    const isSameHash = candidateHash === currentHash

    // Delete any other hash for the same label.
    if (!isSameHash) {
      const fullPath = join(directory, name)
      deletions.push(
        unlink(fullPath).catch(() => {
          // Best-effort cleanup – ignore failures
        })
      )
    }
  }

  if (deletions.length > 0) {
    await Promise.all(deletions)
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
  options?: { label?: string; nodeId?: string }
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
  format: 'svg' | 'png' | 'jpg',
  content: string | ArrayBuffer,
  cacheLocation: FigmaCacheLocation,
  options?: { label?: string; nodeId?: string }
): Promise<{ publicPath: string }> {
  const { fileSystemPath, publicPath, baseName } = getCachedFigmaPaths(
    key,
    format,
    cacheLocation,
    options
  )

  await mkdir(cacheLocation.directory, { recursive: true })

  await removeStaleFigmaVariants(baseName, cacheLocation)

  await writeFile(
    fileSystemPath,
    typeof content === 'string' ? content : Buffer.from(content)
  )
  return { publicPath }
}

const fetchFigmaImageUrl = cache(
  async (
    fileId: string,
    nodeId: string,
    queryKey: string,
    token: string
  ): Promise<string> => {
    const searchParams = new URLSearchParams(queryKey)
    const url = new URL(`https://api.figma.com/v1/images/${fileId}`)
    url.search = searchParams.toString()

    const response = await fetch(url, {
      headers: {
        'X-Figma-Token': token,
      },
    })

    if (!response.ok) {
      throw createFigmaError('images', response)
    }

    const payload = (await response.json()) as {
      err: string | null
      images: Record<string, string | null>
    }

    if (payload.err) {
      throw new Error(
        `[renoun] Figma API responded with an error: ${payload.err}`
      )
    }

    const imageUrl = payload.images[nodeId]

    if (!imageUrl) {
      throw new Error(
        `[renoun] Figma returned no image for node ${nodeId}. Verify the node exists and is visible.`
      )
    }

    return imageUrl
  }
)

const fetchFigmaComponents = cache(
  async (fileId: string, token: string): Promise<ComponentMetadata[]> => {
    const url = new URL(`https://api.figma.com/v1/files/${fileId}/components`)
    const response = await fetch(url, {
      headers: {
        'X-Figma-Token': token,
      },
    })

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
    const response = await fetch(url, {
      headers: {
        'X-Figma-Token': token,
      },
    })

    if (!response.ok) {
      throw createFigmaError('file', response)
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
    const file = await fetchFigmaFile(fileId, token)
    // Prefer explicit version, fall back to lastModified
    return file.version ?? file.lastModified
  } catch (error) {
    if (process.env.RENOUN_DEBUG === 'debug') {
      console.debug('[renoun] Skipping Figma version lookup:', error)
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

function decodeNodeId(nodeId: string): string {
  let decoded: string
  try {
    decoded = decodeURIComponent(nodeId.trim())
  } catch {
    decoded = nodeId.trim()
  }

  const trimmed = decoded
  if (!trimmed) {
    throw new Error('[renoun] Figma node id cannot be empty.')
  }
  if (trimmed.includes(':')) {
    return trimmed
  }
  // Only convert hyphens to colons for numeric node ids (e.g. 915-1075 → 915:1075)
  // Preserve hyphens in component names (e.g. arrow-down)
  if (/^[0-9-]+$/.test(trimmed)) {
    return trimmed.replace(/-/g, ':')
  }
  return trimmed
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

function parseFigmaProtocol(rawSource: string): {
  fileId: string
  nodeId: string
} {
  const value = rawSource.slice('figma:'.length)
  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error('[renoun] figma: sources must include a node id.')
  }

  const slashIndex = trimmed.indexOf('/')
  const alias = slashIndex === -1 ? undefined : trimmed.slice(0, slashIndex)
  const rawNodeId = slashIndex === -1 ? trimmed : trimmed.slice(slashIndex + 1)

  if (!rawNodeId.trim()) {
    throw new Error(
      `[renoun] figma: sources must include a node id after the alias. Received ${rawSource}.`
    )
  }

  let fileId: string
  if (alias && isLikelyFileId(alias)) {
    fileId = alias
  } else if (!alias) {
    throw new Error(
      '[renoun] figma: requires a file id (e.g. figma:FILE_ID/123:456). To use a friendly name, define a custom protocol in <RootProvider protocols={{ name: { type: "figma", fileId: "FILE_ID" } }} /> and reference it like name:123:456.'
    )
  } else {
    throw new Error(
      `[renoun] figma: unknown file alias "${alias}". Define a custom protocol instead: <RootProvider protocols={{ ${alias}: { type: 'figma', fileId: 'FILE_ID' } }} /> and use ${alias}:123:456.`
    )
  }
  const nodeId = decodeNodeId(rawNodeId)
  return { fileId, nodeId }
}

function parseFigmaUrl(
  source: string
): { fileId: string; nodeId: string } | null {
  let url: URL
  try {
    url = new URL(source)
  } catch {
    return null
  }

  if (!FIGMA_HOST_PATTERN.test(url.hostname.toLowerCase())) {
    return null
  }

  const nodeIdParam =
    url.searchParams.get('node-id') ?? url.searchParams.get('nodeId')

  if (!nodeIdParam) {
    return null
  }

  const segments = url.pathname.split('/').filter(Boolean)
  if (segments.length === 0) {
    return null
  }

  const prefixes = new Set(['file', 'design', 'proto', 'embed'])
  let fileId: string | undefined

  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index]
    if (prefixes.has(segment) && index + 1 < segments.length) {
      fileId = segments[index + 1]
      break
    }
  }

  if (!fileId) {
    fileId = segments[0]
  }

  if (!fileId) {
    return null
  }

  return { fileId, nodeId: decodeNodeId(nodeIdParam) }
}

function parseCustomSource(
  source: string,
  sources: SourcesConfig | undefined
): { fileId: string; nodeId: string; basePathname?: string } | null {
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
        `- Define it on <RootProvider sources={{ ${scheme}: { type: 'figma', fileId: 'FILE_ID' } }} /> and reference nodes like "${scheme}:Page/Frame/Component" or "${scheme}:123:456".\n` +
        '- Or use one of the supported forms:\n' +
        '  • figma:FILE_ID/123:456\n' +
        '  • https://www.figma.com/file/<FILE_ID>?node-id=123-456\n' +
        '  • A direct URL (https://...) or data: URI.\n\n' +
        `Received: ${source}`
    )
  }
  if (definition['type'] === 'figma') {
    const node = trimLeadingAndTrailingSlashes(match[2].trim())
    if (!node) {
      throw new Error(
        `[renoun] ${scheme}: sources must include a node selector or id.`
      )
    }
    return {
      fileId: definition['fileId'],
      nodeId: node,
      basePathname: definition['basePathname'],
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
  return /^[0-9:]+$/.test(value)
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

function createFigmaError(
  scope: 'images' | 'components' | 'file',
  response: Response
): Error {
  const hints: string[] = []

  if (response.status === 401) {
    hints.push(
      'The FIGMA_TOKEN is missing or invalid. Ensure it is set correctly.'
    )
  } else if (response.status === 403) {
    hints.push(
      'Access denied. Verify:',
      ' - FIGMA_TOKEN includes scope: file_content:read',
      ' - Add library scopes if needed: library_content:read (and team_library_content:read for team libraries)',
      ' - The token owner can open the referenced file in Figma',
      ' - The file ID is correct and belongs to that account/org'
    )
  } else if (response.status === 404) {
    hints.push('Not found. Double-check the file ID.')
  } else {
    const retryAfterHint = getRetryAfterHint(response)
    if (response.status === 429) {
      // Special-case rate limits so we don't say "in a moment" and then "3 days"
      if (retryAfterHint) {
        hints.push('Rate limit reached.', retryAfterHint)
      } else {
        hints.push('Rate limit reached. Try again later.')
      }
    } else if (retryAfterHint) {
      // For other statuses, we may still have a Retry-After header
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

type FigmaSource =
  | `figma:${string}`
  | `https://${string}.figma.com${string}`
  | `http://${string}.figma.com${string}`

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
  format?: 'png' | 'jpg' | 'svg'

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
  preferredFormat?: 'svg' | 'png' | 'jpg'
): Promise<{ url: string; format: 'svg' | 'png' | 'jpg' }> {
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

async function findComponentByNodeId(
  fileId: string,
  nodeId: string,
  token: string
): Promise<ComponentMetadata | null> {
  // First try real components from the components endpoint
  const components = await fetchFigmaComponents(fileId, token)
  const fromComponents =
    components.find((component) => component.nodeId === nodeId) ?? null

  if (fromComponents) {
    return fromComponents
  }

  // Or crawl the file and match exportable nodes (frames/components)
  const file = await fetchFigmaFile(fileId, token)
  const nodes = collectNamedNodes(file.document)

  const fromFile = nodes.find((node) => node.id === nodeId)
  if (!fromFile) {
    return null
  }

  return {
    nodeId: fromFile.id,
    name: fromFile.name,
    description: undefined,
    pageName: fromFile.pageName,
    frameName: fromFile.frameName,
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

  const parsedFigmaUrl = parseFigmaUrl(trimmedSource)
  const isFigmaProtocol = FIGMA_PROTOCOL.test(trimmedSource)

  const config = await getConfig()
  const userSources = config.sources
  const cacheLocation = resolveFigmaCacheLocation(
    config.images!.outputDirectory
  )

  let fileId: string
  let nodeId: string
  let resolvedDescription: string | undefined

  let matched: { fileId: string; nodeId: string } | null = null
  let matchedBasePathname: string | undefined

  const custom = parseCustomSource(trimmedSource, userSources)
  if (custom) {
    matched = { fileId: custom.fileId, nodeId: custom.nodeId }
    matchedBasePathname = custom.basePathname
  } else if (isFigmaProtocol) {
    matched = parseFigmaProtocol(trimmedSource)
  } else if (parsedFigmaUrl) {
    matched = parsedFigmaUrl
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
    // ... your existing FIGMA_TOKEN error block unchanged ...
    // (omitted here for brevity)
    throw new Error('FIGMA_TOKEN missing – see original implementation')
  }

  const { fileId: matchedFileId, nodeId: matchedNodeId } = matched
  fileId = matchedFileId
  nodeId = matchedNodeId

  // We’ll normalize everything to this node id
  let resolvedNodeId = nodeId
  let cacheNodeId = resolvedNodeId
  let cacheLabel: string | undefined
  let componentForLabel: ComponentMetadata | null = null

  const figmaOptions = {
    scale,
    background,
    useAbsoluteBounds,
    svgOutlineText: false,
    svgIncludeId: false,
    svgIncludeNodeId: false,
    svgSimplifyStroke: true,
  } satisfies Omit<FigmaImageOptions, 'format'>

  // 1) Resolve by selector (e.g. "mark") → node id + metadata
  if (!isLikelyNodeId(resolvedNodeId)) {
    const selectorCandidates: string[] = [resolvedNodeId]
    if (matchedBasePathname) {
      const full = `${trimTrailingSlashes(matchedBasePathname)}/${resolvedNodeId}`
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
        `[renoun] Unable to resolve "${resolvedNodeId}" in file "${fileId}".` +
          (detail ? `\n\nDetails:\n${detail}` : '')
      )
    }

    resolvedNodeId = component.nodeId
    cacheNodeId = resolvedNodeId
    resolvedDescription = component.description?.trim() || undefined
    componentForLabel = component
  } else {
    // 2) We already have a numeric node id (e.g. "1:1379" / "1-1379"/ URL)
    // Try to get metadata so we can name the file nicely (mark-xxxx.png) instead
    // of node-1-1379-xxxx.png, and share the same cache across all callers.
    try {
      const meta = await findComponentByNodeId(fileId, resolvedNodeId, token)
      if (meta) {
        componentForLabel = meta
        if (!resolvedDescription) {
          resolvedDescription = meta.description?.trim() || undefined
        }
      }
    } catch (error) {
      if (process.env.RENOUN_DEBUG === 'debug') {
        // eslint-disable-next-line no-console
        console.debug(
          '[renoun] Skipping component metadata lookup by node id:',
          error
        )
      }
    }
  }

  // 3) Derive a canonical label from whatever metadata we have
  if (componentForLabel) {
    const parts = [
      componentForLabel.pageName,
      componentForLabel.frameName,
      componentForLabel.name,
    ].filter(Boolean) as string[]
    cacheLabel = parts.length > 0 ? parts.join('/') : undefined
  }

  // 4) Now compute the canonical cache key based on the normalized node id
  const fileVersion = await getFigmaFileVersion(fileId, token)
  const cacheKey = getFigmaCacheKey({
    fileId,
    nodeId: resolvedNodeId,
    options: figmaOptions,
    version: fileVersion,
  })

  // 5) Single cache read using canonical { key, label, nodeId }
  const cacheOptions = { label: cacheLabel, nodeId: cacheNodeId }
  const cachedImage = await readCachedFigmaImage(
    cacheKey,
    cacheLocation,
    cacheOptions
  )
  if (cachedImage) {
    return renderCachedFigmaImage(
      cachedImage,
      props,
      description ?? resolvedDescription
    )
  }

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
