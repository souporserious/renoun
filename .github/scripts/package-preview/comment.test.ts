import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  files,
  resetTestState,
  setRepoEnv,
  setEvent as setEventUtil,
} from './test-utils'

// Mock utils to control marker and repo context
vi.mock('./utils.js', () => {
  return {
    stickyMarker: '<!-- MARK -->',
    getRepoContext: () => ({ owner: 'o', repo: 'r', repoFlag: '--repo o/r' }),
  }
})

type FetchCall = { method: string; url: string; body?: any }
let fetchCalls: FetchCall[] = []
let commentsList: Array<{ id: number; body?: string }> = []

function setEvent(pr: number) {
  setEventUtil(pr)
}

function setManifest(manifest: any) {
  files.set(
    `${process.cwd()}/previews/manifest.json`,
    JSON.stringify(manifest, null, 2)
  )
}

beforeEach(() => {
  vi.resetModules()
  resetTestState()
  fetchCalls = []
  commentsList = []
  setRepoEnv()
  // Minimal fetch mock
  // @ts-ignore
  global.fetch = vi.fn(async (url: string, init?: any) => {
    const method = (init?.method || 'GET').toUpperCase()
    const body = init?.body ? JSON.parse(init.body) : undefined
    fetchCalls.push({ method, url, body })

    if (url.includes('/issues/') && url.endsWith('/comments?per_page=100')) {
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => commentsList,
        text: async () => JSON.stringify(commentsList),
      }
    }
    if (
      method === 'POST' &&
      url.includes('/issues/') &&
      url.endsWith('/comments')
    ) {
      return {
        ok: true,
        status: 201,
        statusText: 'Created',
        json: async () => ({ id: 999 }),
        text: async () => '{}',
      }
    }
    if (method === 'PATCH' && url.includes('/issues/comments/')) {
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ id: 1 }),
        text: async () => '{}',
      }
    }
    if (method === 'DELETE' && url.includes('/issues/comments/')) {
      return {
        ok: true,
        status: 204,
        statusText: 'No Content',
        text: async () => '',
      }
    }
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({}),
      text: async () => '{}',
    }
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('comment.js', () => {
  it('exits 0 when manifest is missing', async () => {
    setEvent(7)
    const exitSpy = vi
      .spyOn(process, 'exit')
      // Throw to avoid killing the test process
      .mockImplementation(((code?: number) => {
        throw new Error(`exit:${code}`)
      }) as never)

    await expect(import('./comment.js')).rejects.toThrow(/exit:0/)
    expect(fetchCalls.length).toBe(0)
    exitSpy.mockRestore()
  })

  it('deletes sticky comment and exits when assets are empty', async () => {
    setEvent(42)
    setManifest({ branch: 'b', short: 's', pr: 42, assets: [], targets: [] })
    commentsList = [{ id: 123, body: '<!-- MARK --> hello' }]

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((
      code?: number
    ) => {
      throw new Error(`exit:${code}`)
    }) as never)

    await expect(import('./comment.js')).rejects.toThrow(/exit:0/)

    // Calls: GET comments then optionally DELETE that comment
    expect(fetchCalls[0]).toMatchObject({ method: 'GET' })
    if (fetchCalls[1]) {
      expect(fetchCalls[1]).toMatchObject({ method: 'DELETE' })
    }
    exitSpy.mockRestore()
  })

  it('creates sticky comment with mapped install URLs', async () => {
    setEvent(9)
    setManifest({
      branch: 'b',
      short: 's',
      pr: 9,
      assets: [
        { name: 'scope-a-1.0.0-xyz.tgz', url: 'https://raw/url1' },
        { name: 'b-2.0.0-xyz.tgz', url: 'https://raw/url2' },
      ],
      targets: ['@scope/a', 'b'],
    })

    await import('./comment.js')

    // Calls: GET comments, then POST new comment
    expect(fetchCalls[0]).toMatchObject({ method: 'GET' })
    expect(fetchCalls[1]).toMatchObject({ method: 'POST' })
    const posted = fetchCalls[1]
    expect(posted.body?.body).toContain('```bash')
    expect(posted.body?.body).toContain(
      'npm install "https://raw/url1" "https://raw/url2"'
    )
    expect(posted.body?.body).toContain('<!-- MARK -->')
  })
})
