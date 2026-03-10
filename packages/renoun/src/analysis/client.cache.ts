import { collapseInvalidationPaths } from '../utils/collapse-invalidation-paths.ts'

export type ClientCachedRpcMethod =
  | 'getQuickInfoAtPosition'
  | 'getSourceTextMetadata'
  | 'resolveTypeAtLocationWithDependencies'
  | 'getTokens'
  | 'getFileExports'
  | 'getOutlineRanges'
  | 'getFileExportMetadata'
  | 'getFileExportStaticValue'
  | 'getFileExportText'
  | 'transpileSourceFile'

export interface ClientRpcCacheEntry {
  value: unknown
  expiresAt: number
  dependencyPaths: readonly string[]
  scopeKey?: string
}

export interface ClientRpcInFlightEntry {
  promise: Promise<unknown>
  dependencyPaths: readonly string[]
  epoch: number
  scopeKey?: string
}

export interface GetFileExportTextRpcResponse {
  text: string
  dependencies?: string[]
}

export interface ClientRpcValueWithDependenciesResponse<Value> {
  __renounClientRpcDependencies: true
  value: Value
  dependencies?: string[]
}

export interface NormalizedInvalidationPaths {
  comparablePaths: string[]
  runtimePaths: string[]
}

export const CLIENT_CACHED_RPC_METHODS = new Set<ClientCachedRpcMethod>([
  'getQuickInfoAtPosition',
  'getSourceTextMetadata',
  'resolveTypeAtLocationWithDependencies',
  'getTokens',
  'getFileExports',
  'getOutlineRanges',
  'getFileExportMetadata',
  'getFileExportStaticValue',
  'getFileExportText',
  'transpileSourceFile',
])

const CLIENT_RPC_METHODS_WITH_CONSERVATIVE_ROOT_DEPENDENCY =
  new Set<ClientCachedRpcMethod>([
    'getQuickInfoAtPosition',
    'getSourceTextMetadata',
    'getTokens',
    'transpileSourceFile',
  ])

const CLIENT_RPC_CACHE_MAX_ENTRIES = 1_000
const CONSERVATIVE_CLIENT_RPC_INVALIDATION_PATH = '.'
const clientRpcCacheByKey = new Map<string, ClientRpcCacheEntry>()
const clientRpcInFlightByKey = new Map<string, ClientRpcInFlightEntry>()
const observedProjectRootCandidates = new Set<string>()
let clientRpcInvalidationEpoch = 0

function normalizeClientSlashes(path: string): string {
  return path.replaceAll('\\', '/')
}

function trimLeadingDotSlash(path: string): string {
  const normalized = normalizeClientSlashes(path)
  if (
    normalized.length >= 2 &&
    normalized.charCodeAt(0) === 46 &&
    normalized.charCodeAt(1) === 47
  ) {
    let start = 2
    while (start < normalized.length && normalized.charCodeAt(start) === 47) {
      start += 1
    }
    return normalized.slice(start)
  }

  return normalized
}

function trimLeadingSlashes(path: string): string {
  let start = 0
  while (start < path.length && path.charCodeAt(start) === 47) {
    start += 1
  }
  return path.slice(start)
}

function trimTrailingSlashes(path: string): string {
  let end = path.length
  while (end > 0 && path.charCodeAt(end - 1) === 47) {
    end -= 1
  }
  return path.slice(0, end)
}

function isAbsoluteClientPath(path: string): boolean {
  const normalized = normalizeClientSlashes(path)
  return (
    normalized.startsWith('/') ||
    /^[A-Za-z]:\//.test(normalized) ||
    normalized.startsWith('//')
  )
}

function normalizeClientPathKey(path: string): string {
  const normalized = trimLeadingDotSlash(normalizeClientSlashes(path))
  const key = trimTrailingSlashes(trimLeadingSlashes(normalized))
  return key === '' ? '.' : key
}

function joinClientPaths(basePath: string, path: string): string {
  const normalizedBasePath = trimTrailingSlashes(normalizeClientSlashes(basePath))
  const normalizedPath = trimLeadingSlashes(trimLeadingDotSlash(path))

  if (!normalizedBasePath) {
    return normalizedPath
  }

  if (!normalizedPath) {
    return normalizedBasePath
  }

  return `${normalizedBasePath}/${normalizedPath}`
}

function resolveClientPath(path: string): string {
  const normalized = normalizeClientSlashes(path)
  if (isAbsoluteClientPath(normalized)) {
    return normalized
  }

  if (typeof process !== 'undefined' && typeof process.cwd === 'function') {
    return joinClientPaths(process.cwd(), normalized)
  }

  return normalized
}

function dirnameClientPath(path: string): string {
  const normalized = trimTrailingSlashes(normalizeClientSlashes(path))
  const lastSlashIndex = normalized.lastIndexOf('/')
  if (lastSlashIndex === -1) {
    return '.'
  }

  if (lastSlashIndex === 0) {
    return normalized.slice(0, 1)
  }

  return normalized.slice(0, lastSlashIndex)
}

function stableStringifyClient(value: unknown): string {
  if (value === undefined) {
    return 'undefined'
  }

  if (typeof value === 'number') {
    if (Number.isNaN(value)) {
      return 'NaN'
    }

    if (value === Number.POSITIVE_INFINITY) {
      return 'Infinity'
    }

    if (value === Number.NEGATIVE_INFINITY) {
      return '-Infinity'
    }
  }

  if (typeof value === 'bigint') {
    return `bigint:${value.toString()}`
  }

  if (typeof value === 'symbol') {
    return `symbol:${value.description ?? ''}`
  }

  if (typeof value === 'function') {
    return `function:${value.name || 'anonymous'}`
  }

  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }

  if (Array.isArray(value)) {
    const entries: string[] = []

    for (let index = 0; index < value.length; index += 1) {
      if (!(index in value)) {
        entries.push('<hole>')
        continue
      }

      entries.push(stableStringifyClient(value[index]))
    }

    return `[${entries.join(',')}]`
  }

  const object = value as Record<string, unknown>
  const keys = Object.keys(object).sort()
  const entries: string[] = []

  for (const key of keys) {
    entries.push(`${JSON.stringify(key)}:${stableStringifyClient(object[key])}`)
  }

  return `{${entries.join(',')}}`
}

function hashClientString(input: string): string {
  let hash = 14695981039346656037n

  for (let index = 0; index < input.length; index += 1) {
    hash ^= BigInt(input.charCodeAt(index))
    hash = BigInt.asUintN(64, hash * 1099511628211n)
  }

  return hash.toString(16).padStart(16, '0')
}

export function toClientRpcCacheKey(
  method: ClientCachedRpcMethod,
  params: unknown
): string {
  return hashClientString(`${method}|${stableStringifyClient(params)}`)
}

function toComparablePath(path: string): string {
  return normalizeClientPathKey(resolveClientPath(path))
}

function toRuntimeInvalidationPath(path: string): string {
  return resolveClientPath(path)
}

function getDefaultProjectRootCandidate(): string | undefined {
  if (typeof process === 'undefined' || typeof process.cwd !== 'function') {
    return undefined
  }

  return resolveClientPath(process.cwd())
}

function getProjectRootCandidates(params: unknown): readonly string[] {
  const roots = new Set<string>()
  const defaultRootCandidate = getDefaultProjectRootCandidate()
  if (defaultRootCandidate) {
    roots.add(defaultRootCandidate)
  }

  if (!params || typeof params !== 'object') {
    return Array.from(roots)
  }

  const candidate = params as {
    analysisOptions?: {
      tsConfigFilePath?: unknown
    }
  }
  const tsConfigFilePath = candidate.analysisOptions?.tsConfigFilePath
  if (typeof tsConfigFilePath === 'string' && tsConfigFilePath.length > 0) {
    roots.add(resolveClientPath(dirnameClientPath(tsConfigFilePath)))
  }

  return Array.from(roots)
}

export function rememberWorkspaceRootCandidates(params: unknown): void {
  for (const rootCandidate of getProjectRootCandidates(params)) {
    observedProjectRootCandidates.add(rootCandidate)
  }
}

function getRefreshInvalidationRootCandidates(): readonly string[] {
  if (observedProjectRootCandidates.size > 0) {
    return Array.from(observedProjectRootCandidates)
  }

  const defaultRootCandidate = getDefaultProjectRootCandidate()
  return defaultRootCandidate ? [defaultRootCandidate] : []
}

function getConservativeClientRpcDependencyPaths(
  params: unknown
): readonly string[] {
  const rootCandidates = getProjectRootCandidates(params)
  if (rootCandidates.length === 0) {
    return [CONSERVATIVE_CLIENT_RPC_INVALIDATION_PATH]
  }

  return rootCandidates.map((rootCandidate) => toComparablePath(rootCandidate))
}

function getCandidatePaths(
  value: unknown,
  rootCandidates: readonly string[]
): readonly string[] {
  if (typeof value !== 'string' || value.length === 0) {
    return []
  }

  const normalized = normalizeClientSlashes(value)
  if (isAbsoluteClientPath(normalized)) {
    return [normalizeClientPathKey(normalized)]
  }

  const resolvedCandidates = new Set<string>()
  for (const rootCandidate of rootCandidates) {
    resolvedCandidates.add(
      normalizeClientPathKey(joinClientPaths(rootCandidate, normalized))
    )
  }

  return Array.from(resolvedCandidates)
}

function getRuntimeCandidatePaths(
  value: unknown,
  rootCandidates: readonly string[]
): readonly string[] {
  if (typeof value !== 'string' || value.length === 0) {
    return []
  }

  const normalized = normalizeClientSlashes(value)
  if (isAbsoluteClientPath(normalized)) {
    return [normalized]
  }

  const resolvedCandidates = new Set<string>()
  for (const rootCandidate of rootCandidates) {
    resolvedCandidates.add(
      normalizeClientSlashes(joinClientPaths(rootCandidate, normalized))
    )
  }

  return Array.from(resolvedCandidates)
}

function pathsIntersect(firstPath: string, secondPath: string): boolean {
  if (firstPath === '.' || secondPath === '.') {
    return true
  }

  if (
    firstPath === secondPath ||
    firstPath.startsWith(`${secondPath}/`) ||
    secondPath.startsWith(`${firstPath}/`)
  ) {
    return true
  }

  const firstIsAbsolute = isAbsoluteClientPath(firstPath)
  const secondIsAbsolute = isAbsoluteClientPath(secondPath)
  if (firstIsAbsolute === secondIsAbsolute) {
    return false
  }

  return doesAbsolutePathContainRelativePath(
    firstIsAbsolute ? firstPath : secondPath,
    firstIsAbsolute ? secondPath : firstPath
  )
}

function doesAbsolutePathContainRelativePath(
  absolutePath: string,
  relativePath: string
): boolean {
  const normalizedRelativePath = trimTrailingSlashes(
    trimLeadingSlashes(trimLeadingDotSlash(relativePath))
  )
  if (normalizedRelativePath.length === 0) {
    return false
  }

  return (
    absolutePath.endsWith(`/${normalizedRelativePath}`) ||
    absolutePath.includes(`/${normalizedRelativePath}/`)
  )
}

function hasPathDependencyIntersection(
  dependencyPaths: readonly string[],
  normalizedPath: string
): boolean {
  return dependencyPaths.some((dependencyPath) =>
    pathsIntersect(dependencyPath, normalizedPath)
  )
}

export function collectClientRpcDependencyPaths(
  method: ClientCachedRpcMethod,
  params: unknown
): string[] {
  const candidate = params as {
    filePath?: unknown
    sourcePath?: unknown
    analysisOptions?: {
      tsConfigFilePath?: unknown
    }
  }
  const dependencyPaths = new Set<string>()
  const rootCandidates = getProjectRootCandidates(params)

  for (const filePath of getCandidatePaths(candidate.filePath, rootCandidates)) {
    dependencyPaths.add(filePath)
  }

  if (method === 'getTokens') {
    for (const sourcePath of getCandidatePaths(
      candidate.sourcePath,
      rootCandidates
    )) {
      dependencyPaths.add(sourcePath)
    }
  }

  for (const tsConfigFilePath of getCandidatePaths(
    candidate.analysisOptions?.tsConfigFilePath,
    rootCandidates
  )) {
    dependencyPaths.add(tsConfigFilePath)
  }

  if (CLIENT_RPC_METHODS_WITH_CONSERVATIVE_ROOT_DEPENDENCY.has(method)) {
    for (const dependencyPath of getConservativeClientRpcDependencyPaths(
      params
    )) {
      dependencyPaths.add(dependencyPath)
    }
  }

  return Array.from(dependencyPaths)
}

export function collectClientRpcResponseDependencyPaths(
  method: ClientCachedRpcMethod,
  params: unknown,
  value: unknown
): string[] {
  const rootCandidates = getProjectRootCandidates(params)
  const dependencyPaths = new Set<string>()
  let responseValue = value

  if (
    method === 'getFileExportText' &&
    (params as { includeDependencies?: unknown }).includeDependencies !== true
  ) {
    return []
  }

  if (isClientRpcValueWithDependenciesResponse(responseValue)) {
    addCandidateResponseDependencyPaths(
      responseValue.dependencies,
      rootCandidates,
      dependencyPaths
    )
    responseValue = responseValue.value
  }

  if (
    method === 'resolveTypeAtLocationWithDependencies' ||
    method === 'getFileExportText'
  ) {
    addCandidateResponseDependencyPaths(
      (responseValue as { dependencies?: unknown }).dependencies,
      rootCandidates,
      dependencyPaths
    )
  }

  if (method === 'getFileExports') {
    const candidate = responseValue as Array<{ path?: unknown }>
    if (Array.isArray(candidate)) {
      for (const fileExport of candidate) {
        for (const dependencyPath of getCandidatePaths(
          fileExport.path,
          rootCandidates
        )) {
          dependencyPaths.add(dependencyPath)
        }
      }
    }
  }

  if (method === 'getFileExportMetadata') {
    const candidate = responseValue as {
      location?: {
        filePath?: unknown
      }
    }
    for (const dependencyPath of getCandidatePaths(
      candidate.location?.filePath,
      rootCandidates
    )) {
      dependencyPaths.add(dependencyPath)
    }
  }

  return Array.from(dependencyPaths)
}

function addCandidateResponseDependencyPaths(
  dependencies: unknown,
  rootCandidates: readonly string[],
  dependencyPaths: Set<string>
): void {
  if (!Array.isArray(dependencies)) {
    return
  }

  for (const dependency of dependencies) {
    for (const dependencyPath of getCandidatePaths(dependency, rootCandidates)) {
      dependencyPaths.add(dependencyPath)
    }
  }
}

export function isClientRpcValueWithDependenciesResponse<Value>(
  value: unknown
): value is ClientRpcValueWithDependenciesResponse<Value> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }

  const candidate = value as {
    __renounClientRpcDependencies?: unknown
  }

  return candidate.__renounClientRpcDependencies === true
}

export function toClientRpcResponseValue<Value>(
  value: Value | ClientRpcValueWithDependenciesResponse<Value>
): Value {
  if (isClientRpcValueWithDependenciesResponse<Value>(value)) {
    return value.value
  }

  return value
}

export function toGetFileExportTextRpcValueText(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }

  const candidate = value as GetFileExportTextRpcResponse
  if (typeof candidate?.text === 'string') {
    return candidate.text
  }

  throw new Error('[renoun] Invalid getFileExportText RPC response payload.')
}

export function shouldBypassClientRpcCache(
  method: ClientCachedRpcMethod,
  params: unknown,
  consumeRefreshNotifications: boolean
): boolean {
  if (method === 'getFileExportText') {
    const candidate = params as { includeDependencies?: unknown }
    return (
      candidate.includeDependencies === true && !consumeRefreshNotifications
    )
  }

  return false
}

export function pruneExpiredClientRpcCacheEntries(now = Date.now()): void {
  for (const [cacheKey, entry] of clientRpcCacheByKey) {
    if (entry.expiresAt <= now) {
      clientRpcCacheByKey.delete(cacheKey)
    }
  }
}

export function readClientRpcCacheEntry(
  cacheKey: string
): ClientRpcCacheEntry | undefined {
  const cached = clientRpcCacheByKey.get(cacheKey)
  if (!cached) {
    return undefined
  }

  clientRpcCacheByKey.delete(cacheKey)
  clientRpcCacheByKey.set(cacheKey, cached)
  return cached
}

export function setClientRpcCacheEntry(
  cacheKey: string,
  entry: ClientRpcCacheEntry
): void {
  clientRpcCacheByKey.set(cacheKey, entry)
}

export function trimClientRpcCache(): void {
  while (clientRpcCacheByKey.size > CLIENT_RPC_CACHE_MAX_ENTRIES) {
    const oldestKey = clientRpcCacheByKey.keys().next().value as
      | string
      | undefined
    if (!oldestKey) {
      return
    }

    clientRpcCacheByKey.delete(oldestKey)
  }
}

export function getClientRpcInFlightEntry(
  cacheKey: string
): ClientRpcInFlightEntry | undefined {
  return clientRpcInFlightByKey.get(cacheKey)
}

export function setClientRpcInFlightEntry(
  cacheKey: string,
  entry: ClientRpcInFlightEntry
): void {
  clientRpcInFlightByKey.set(cacheKey, entry)
}

export function deleteClientRpcInFlightEntry(cacheKey: string): void {
  clientRpcInFlightByKey.delete(cacheKey)
}

export function deleteClientRpcInFlightEntryIfPromise(
  cacheKey: string,
  promise: Promise<unknown>
): void {
  const latest = clientRpcInFlightByKey.get(cacheKey)
  if (latest?.promise === promise) {
    clientRpcInFlightByKey.delete(cacheKey)
  }
}

export function getClientRpcInvalidationEpoch(): number {
  return clientRpcInvalidationEpoch
}

export function setClientRpcInvalidationEpoch(epoch: number): void {
  clientRpcInvalidationEpoch = Math.max(0, Math.floor(epoch))
}

export function normalizeInvalidationPaths(
  paths: Iterable<string>
): NormalizedInvalidationPaths {
  const rootCandidates = getRefreshInvalidationRootCandidates()
  const runtimePathByComparablePath = new Map<string, string>()
  for (const path of paths) {
    if (typeof path !== 'string' || path.length === 0) {
      continue
    }

    const resolvedCandidatePaths = getRuntimeCandidatePaths(path, rootCandidates)
    const candidatePaths =
      resolvedCandidatePaths.length > 0
        ? resolvedCandidatePaths
        : [toRuntimeInvalidationPath(path)]

    for (const candidatePath of candidatePaths) {
      const comparablePath = toComparablePath(candidatePath)
      if (!runtimePathByComparablePath.has(comparablePath)) {
        runtimePathByComparablePath.set(comparablePath, candidatePath)
      }
    }
  }

  const comparablePaths = collapseInvalidationPaths(
    runtimePathByComparablePath.keys()
  )
  const runtimePaths = comparablePaths.map((comparablePath) => {
    return runtimePathByComparablePath.get(comparablePath) ?? comparablePath
  })

  return { comparablePaths, runtimePaths }
}

function hasPathDependencyIntersectionWithAnyPath(
  dependencyPaths: readonly string[],
  normalizedPaths: readonly string[]
): boolean {
  return normalizedPaths.some((normalizedPath) =>
    hasPathDependencyIntersection(dependencyPaths, normalizedPath)
  )
}

function shouldInvalidateClientRpcEntryForScope(
  entryScopeKey: string | undefined,
  invalidationScopeKey: string | undefined
): boolean {
  if (invalidationScopeKey === undefined) {
    return true
  }

  return entryScopeKey === undefined || entryScopeKey === invalidationScopeKey
}

export function invalidateClientRpcCacheByNormalizedPaths(
  normalizedPaths: readonly string[],
  invalidationScopeKey?: string
): number {
  clientRpcInvalidationEpoch += 1

  for (const [cacheKey, entry] of clientRpcCacheByKey) {
    if (
      shouldInvalidateClientRpcEntryForScope(
        entry.scopeKey,
        invalidationScopeKey
      ) &&
      hasPathDependencyIntersectionWithAnyPath(
        entry.dependencyPaths,
        normalizedPaths
      )
    ) {
      clientRpcCacheByKey.delete(cacheKey)
    }
  }

  for (const [cacheKey, entry] of clientRpcInFlightByKey) {
    if (
      shouldInvalidateClientRpcEntryForScope(
        entry.scopeKey,
        invalidationScopeKey
      ) &&
      hasPathDependencyIntersectionWithAnyPath(
        entry.dependencyPaths,
        normalizedPaths
      )
    ) {
      clientRpcInFlightByKey.delete(cacheKey)
    }
  }

  return clientRpcInvalidationEpoch
}

export function invalidateAllClientRpcCache(
  invalidationScopeKey?: string
): number {
  clientRpcInvalidationEpoch += 1

  if (invalidationScopeKey === undefined) {
    clientRpcCacheByKey.clear()
    clientRpcInFlightByKey.clear()
    return clientRpcInvalidationEpoch
  }

  for (const [cacheKey, entry] of clientRpcCacheByKey) {
    if (
      shouldInvalidateClientRpcEntryForScope(
        entry.scopeKey,
        invalidationScopeKey
      )
    ) {
      clientRpcCacheByKey.delete(cacheKey)
    }
  }

  for (const [cacheKey, entry] of clientRpcInFlightByKey) {
    if (
      shouldInvalidateClientRpcEntryForScope(
        entry.scopeKey,
        invalidationScopeKey
      )
    ) {
      clientRpcInFlightByKey.delete(cacheKey)
    }
  }

  return clientRpcInvalidationEpoch
}

export function resetClientRpcCacheForRuntimeChange(): number {
  clientRpcInvalidationEpoch += 1
  clientRpcCacheByKey.clear()
  clientRpcInFlightByKey.clear()
  return clientRpcInvalidationEpoch
}

export function collectConservativeRefreshFallbackPaths(): string[] {
  if (observedProjectRootCandidates.size === 0) {
    const defaultRootCandidate = getDefaultProjectRootCandidate()
    if (defaultRootCandidate) {
      return [defaultRootCandidate]
    }
  }

  return Array.from(observedProjectRootCandidates)
}

export function clearClientRpcCacheStateForTests(): void {
  clientRpcCacheByKey.clear()
  clientRpcInFlightByKey.clear()
  observedProjectRootCandidates.clear()
  clientRpcInvalidationEpoch = 0
}
