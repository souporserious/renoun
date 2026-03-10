import {
  mkdtempSync,
  mkdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const originalFetch = globalThis.fetch
const originalCwd = process.cwd()
const originalSponsorsToken = process.env['GITHUB_SPONSORS_TOKEN']
const SPONSORS_CACHE_PREFIX = 'component-sponsors:2:github-sponsors:'

async function clearSponsorsCache(): Promise<void> {
  const [{ NodeFileSystem }, { Session }] = await Promise.all([
    import('../file-system/NodeFileSystem.ts'),
    import('../file-system/Session.ts'),
  ])
  const session = Session.for(new NodeFileSystem())
  const nodeKeys = await session.cache.listNodeKeysByPrefix(SPONSORS_CACHE_PREFIX)
  if (nodeKeys.length > 0) {
    await session.cache.deleteMany(nodeKeys)
  }
}

async function withWorkingDirectory<T>(
  directory: string,
  callback: () => Promise<T>
): Promise<T> {
  const previousCwd = process.cwd()
  process.chdir(directory)

  try {
    return await callback()
  } finally {
    process.chdir(previousCwd)
  }
}

function createGraphqlResponse(options?: {
  username?: string
  viewerLogin?: string
}) {
  const username = options?.username ?? 'octocat'
  const viewerLogin = options?.viewerLogin ?? 'renoun'

  return new Response(
    JSON.stringify({
      data: {
        viewer: {
          login: viewerLogin,
          sponsorsListing: {
            tiers: {
              nodes: [
                {
                  name: 'Bronze',
                  description: 'Bronze tier',
                  descriptionHTML: '<p>Bronze tier</p>',
                  isOneTime: false,
                  monthlyPriceInCents: 10_000,
                  adminInfo: {
                    isPublished: true,
                    isRetired: false,
                  },
                },
              ],
            },
          },
          sponsorshipsAsMaintainer: {
            nodes: [
              {
                createdAt: '2024-01-01T00:00:00.000Z',
                sponsorEntity: {
                  username,
                  avatar_64: 'https://avatars.githubusercontent.com/u/583231?v=4',
                },
                tier: {
                  monthlyPriceInCents: 10_000,
                },
                tierSelectedAt: '2024-01-02T00:00:00.000Z',
              },
            ],
          },
        },
      },
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  )
}

function createSponsorsPageResponse(viewerLogin = 'renoun') {
  return new Response(
    `
      <html>
        <body>
          <a href="/sponsors/${viewerLogin}/sponsorships?tier_id=12345">Sponsor</a>
          <p>Bronze tier</p>
        </body>
      </html>
    `,
    {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    }
  )
}

describe('Sponsors cache', () => {
  beforeEach(async () => {
    vi.resetModules()
    await clearSponsorsCache()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    if (process.cwd() !== originalCwd) {
      process.chdir(originalCwd)
    }

    if (originalSponsorsToken === undefined) {
      delete process.env['GITHUB_SPONSORS_TOKEN']
    } else {
      process.env['GITHUB_SPONSORS_TOKEN'] = originalSponsorsToken
    }
  })

  it('reuses cached GitHub responses for repeated identical renders', async () => {
    const { Sponsors } = await import('./Sponsors.tsx')
    process.env['GITHUB_SPONSORS_TOKEN'] = `token-${Date.now()}`

    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const url = typeof input === 'string' ? input : input.toString()
        if (url === 'https://api.github.com/graphql') {
          return createGraphqlResponse()
        }

        if (url === 'https://github.com/sponsors/renoun') {
          return createSponsorsPageResponse('renoun')
        }

        throw new Error(`Unexpected fetch URL: ${url}`)
      }
    )

    globalThis.fetch = fetchMock as typeof fetch

    const tiers = [{ amount: 100, title: 'Bronze' }] as const

    let firstResolvedTiers: unknown
    await Sponsors({
      tiers,
      children: (resolvedTiers) => {
        firstResolvedTiers = resolvedTiers
        return <></>
      },
    })

    let secondResolvedTiers: unknown
    await Sponsors({
      tiers,
      children: (resolvedTiers) => {
        secondResolvedTiers = resolvedTiers
        return <></>
      },
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(secondResolvedTiers).toEqual(firstResolvedTiers)
    expect(secondResolvedTiers).toEqual([
      {
        href: 'https://github.com/sponsors/renoun/sponsorships?tier_id=12345',
        sponsors: [
          {
            username: 'octocat',
            avatarUrl: 'https://avatars.githubusercontent.com/u/583231?v=4',
          },
        ],
        title: 'Bronze',
        description: 'Bronze tier',
      },
    ])
  })

  it('separates persistent cache entries across different sponsor tokens', async () => {
    const { Sponsors } = await import('./Sponsors.tsx')
    process.env['GITHUB_SPONSORS_TOKEN'] = 'token-one'

    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const url = typeof input === 'string' ? input : input.toString()
        if (url === 'https://api.github.com/graphql') {
          const authorization = new Headers(init?.headers).get('Authorization')

          if (authorization === 'Bearer token-one') {
            return createGraphqlResponse({
              username: 'octocat-one',
              viewerLogin: 'renoun-one',
            })
          }

          if (authorization === 'Bearer token-two') {
            return createGraphqlResponse({
              username: 'octocat-two',
              viewerLogin: 'renoun-two',
            })
          }

          throw new Error(`Unexpected authorization header: ${authorization}`)
        }

        if (url === 'https://github.com/sponsors/renoun-one') {
          return createSponsorsPageResponse('renoun-one')
        }

        if (url === 'https://github.com/sponsors/renoun-two') {
          return createSponsorsPageResponse('renoun-two')
        }

        throw new Error(`Unexpected fetch URL: ${url}`)
      }
    )

    globalThis.fetch = fetchMock as typeof fetch

    const tiers = [{ amount: 100, title: 'Bronze' }] as const

    let firstResolvedTiers: unknown
    await Sponsors({
      tiers,
      children: (resolvedTiers) => {
        firstResolvedTiers = resolvedTiers
        return <></>
      },
    })

    process.env['GITHUB_SPONSORS_TOKEN'] = 'token-two'

    let secondResolvedTiers: unknown
    await Sponsors({
      tiers,
      children: (resolvedTiers) => {
        secondResolvedTiers = resolvedTiers
        return <></>
      },
    })

    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(firstResolvedTiers).toEqual([
      {
        href: 'https://github.com/sponsors/renoun-one/sponsorships?tier_id=12345',
        sponsors: [
          {
            username: 'octocat-one',
            avatarUrl: 'https://avatars.githubusercontent.com/u/583231?v=4',
          },
        ],
        title: 'Bronze',
        description: 'Bronze tier',
      },
    ])
    expect(secondResolvedTiers).toEqual([
      {
        href: 'https://github.com/sponsors/renoun-two/sponsorships?tier_id=12345',
        sponsors: [
          {
            username: 'octocat-two',
            avatarUrl: 'https://avatars.githubusercontent.com/u/583231?v=4',
          },
        ],
        title: 'Bronze',
        description: 'Bronze tier',
      },
    ])
  })

  it('uses cacheTtlMs prop override', async () => {
    const { Sponsors } = await import('./Sponsors.tsx')
    process.env['GITHUB_SPONSORS_TOKEN'] = `token-${Date.now()}`

    const fetchMock = vi.fn(
      async (input: RequestInfo | URL): Promise<Response> => {
        const url = typeof input === 'string' ? input : input.toString()
        if (url === 'https://api.github.com/graphql') {
          return createGraphqlResponse()
        }

        if (url === 'https://github.com/sponsors/renoun') {
          return createSponsorsPageResponse('renoun')
        }

        throw new Error(`Unexpected fetch URL: ${url}`)
      }
    )

    globalThis.fetch = fetchMock as typeof fetch

    const tiers = [{ amount: 100, title: 'Bronze' }] as const

    await Sponsors({
      tiers,
      cacheTtlMs: 0,
      children: () => <></>,
    })
    await Sponsors({
      tiers,
      cacheTtlMs: 0,
      children: () => <></>,
    })

    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('scopes cached sponsor sessions by workspace root in the same process', async () => {
    const [{ Sponsors }, { disposeCacheStorePersistence }] = await Promise.all([
      import('./Sponsors.tsx'),
      import('../file-system/CacheSqlite.ts'),
    ])
    const tempDirectory = mkdtempSync(
      join(tmpdir(), 'renoun-sponsors-workspace-root-')
    )
    const workspaceOne = join(tempDirectory, 'workspace-one')
    const workspaceTwo = join(tempDirectory, 'workspace-two')
    const tiers = [{ amount: 100, title: 'Bronze' }] as const

    mkdirSync(workspaceOne, { recursive: true })
    mkdirSync(workspaceTwo, { recursive: true })
    writeFileSync(
      join(workspaceOne, 'package.json'),
      JSON.stringify({ name: 'sponsors-workspace-one', private: true }),
      'utf8'
    )
    writeFileSync(
      join(workspaceTwo, 'package.json'),
      JSON.stringify({ name: 'sponsors-workspace-two', private: true }),
      'utf8'
    )
    const canonicalWorkspaceOne = realpathSync(workspaceOne)
    const canonicalWorkspaceTwo = realpathSync(workspaceTwo)

    process.env['GITHUB_SPONSORS_TOKEN'] = 'shared-token'

    const fetchMock = vi.fn(
      async (input: RequestInfo | URL): Promise<Response> => {
        const url = typeof input === 'string' ? input : input.toString()
        const currentWorkspace = realpathSync(process.cwd())

        if (url === 'https://api.github.com/graphql') {
          if (currentWorkspace === canonicalWorkspaceOne) {
            return createGraphqlResponse({
              username: 'octocat-one',
              viewerLogin: 'renoun-one',
            })
          }

          if (currentWorkspace === canonicalWorkspaceTwo) {
            return createGraphqlResponse({
              username: 'octocat-two',
              viewerLogin: 'renoun-two',
            })
          }
        }

        if (url === 'https://github.com/sponsors/renoun-one') {
          return createSponsorsPageResponse('renoun-one')
        }

        if (url === 'https://github.com/sponsors/renoun-two') {
          return createSponsorsPageResponse('renoun-two')
        }

        throw new Error(
          `Unexpected fetch URL "${url}" while rendering from "${currentWorkspace}"`
        )
      }
    )

    globalThis.fetch = fetchMock as typeof fetch

    let firstResolvedTiers: unknown
    let secondResolvedTiers: unknown

    try {
      await withWorkingDirectory(workspaceOne, async () => {
        await clearSponsorsCache()
        await Sponsors({
          tiers,
          children: (resolvedTiers) => {
            firstResolvedTiers = resolvedTiers
            return <></>
          },
        })
      })

      await withWorkingDirectory(workspaceTwo, async () => {
        await clearSponsorsCache()
        await Sponsors({
          tiers,
          children: (resolvedTiers) => {
            secondResolvedTiers = resolvedTiers
            return <></>
          },
        })
      })

      expect(fetchMock).toHaveBeenCalledTimes(4)
      expect(firstResolvedTiers).toEqual([
        {
          href: 'https://github.com/sponsors/renoun-one/sponsorships?tier_id=12345',
          sponsors: [
            {
              username: 'octocat-one',
              avatarUrl: 'https://avatars.githubusercontent.com/u/583231?v=4',
            },
          ],
          title: 'Bronze',
          description: 'Bronze tier',
        },
      ])
      expect(secondResolvedTiers).toEqual([
        {
          href: 'https://github.com/sponsors/renoun-two/sponsorships?tier_id=12345',
          sponsors: [
            {
              username: 'octocat-two',
              avatarUrl: 'https://avatars.githubusercontent.com/u/583231?v=4',
            },
          ],
          title: 'Bronze',
          description: 'Bronze tier',
        },
      ])
    } finally {
      disposeCacheStorePersistence({ projectRoot: canonicalWorkspaceOne })
      disposeCacheStorePersistence({ projectRoot: canonicalWorkspaceTwo })
      rmSync(tempDirectory, { recursive: true, force: true })
    }
  })

  it('recovers cache session setup after a transient failure', async () => {
    const [{ Sponsors }, { Session }] = await Promise.all([
      import('./Sponsors.tsx'),
      import('../file-system/Session.ts'),
    ])
    process.env['GITHUB_SPONSORS_TOKEN'] = `token-${Date.now()}`

    const sessionForSpy = vi.spyOn(Session, 'for')
    sessionForSpy.mockImplementationOnce(() => {
      throw new Error('transient session initialization failure')
    })

    const fetchMock = vi.fn(
      async (input: RequestInfo | URL): Promise<Response> => {
        const url = typeof input === 'string' ? input : input.toString()
        if (url === 'https://api.github.com/graphql') {
          return createGraphqlResponse()
        }

        if (url === 'https://github.com/sponsors/renoun') {
          return createSponsorsPageResponse('renoun')
        }

        throw new Error(`Unexpected fetch URL: ${url}`)
      }
    )

    globalThis.fetch = fetchMock as typeof fetch

    const tiers = [{ amount: 100, title: 'Bronze' }] as const

    await Sponsors({
      tiers,
      children: () => <></>,
    })
    await Sponsors({
      tiers,
      children: () => <></>,
    })
    await Sponsors({
      tiers,
      children: () => <></>,
    })

    expect(sessionForSpy).toHaveBeenCalledTimes(2)
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })
})
