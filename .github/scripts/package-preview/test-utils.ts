import { vi } from 'vitest'

export let files = new Map<string, string>()
export let execCalls: string[] = []
let execResponder: ((cmd: string) => string) | null = null

// Factory to (re)create the fs mock using current in-memory state
function createFsMock() {
  return {
    existsSync: (p: any) => files.has(String(p)),
    readFileSync: (p: any) => {
      const key = String(p)
      if (!files.has(key)) throw new Error(`ENOENT: ${key}`)
      return files.get(key) as string
    },
    writeFileSync: (p: any, data: any) => {
      files.set(String(p), typeof data === 'string' ? data : String(data))
    },
    mkdirSync: (p: any) => {
      files.set(String(p), '__dir__')
    },
    rmSync: (p: any) => {
      const base = String(p)
      for (const entry of Array.from(files.keys())) {
        if (entry === base || entry.startsWith(base + '/')) files.delete(entry)
      }
    },
    cpSync: (from: any, to: any) => {
      const src = String(from)
      const dst = String(to)
      files.set(dst, files.get(src) || '')
    },
  }
}

// Mock node:fs globally for tests using this helper
vi.mock('node:fs', () => createFsMock())

// Factory to (re)create the child_process mock
function createChildProcessMock() {
  return {
    execSync: (cmd: any) => {
      const str = String(cmd)
      execCalls.push(str)
      const out = execResponder ? execResponder(str) : ''
      return out as any
    },
  }
}

// Mock node:child_process to capture commands
vi.mock('node:child_process', () => createChildProcessMock())

// Utilities to re-apply mocks if a test temporarily unmocks real modules
export function resetMockFs() {
  vi.doMock('node:fs', () => createFsMock())
}

export function resetMockChildProcess() {
  vi.doMock('node:child_process', () => createChildProcessMock())
}

export async function withRealFs<T>(fn: () => Promise<T> | T): Promise<T> {
  vi.unmock('node:fs')
  try {
    return await fn()
  } finally {
    resetMockFs()
  }
}

export async function withRealExec<T>(fn: () => Promise<T> | T): Promise<T> {
  vi.unmock('node:child_process')
  try {
    return await fn()
  } finally {
    resetMockChildProcess()
  }
}

export function resetTestState() {
  files = new Map<string, string>()
  execCalls = []
  execResponder = null
  // Clear any stubbed envs
  vi.unstubAllEnvs()
  // Ensure mocks are re-applied in case a test used real modules
  resetMockFs()
  resetMockChildProcess()
}

export function setExecResponder(fn: (cmd: string) => string) {
  execResponder = fn
}

export function writeFile(path: string, content: string) {
  files.set(path, content)
}

export function setRepoEnv(ownerRepo = 'o/r', token = 't') {
  vi.stubEnv('GITHUB_REPOSITORY', ownerRepo)
  vi.stubEnv('GH_TOKEN', token)
}

export function setEvent(prNumber: number, extra: any = {}) {
  const eventPath = '/event.json'
  const payload = { pull_request: { number: prNumber, ...extra } }
  files.set(eventPath, JSON.stringify(payload, null, 2))
  vi.stubEnv('GITHUB_EVENT_PATH', eventPath)
}
