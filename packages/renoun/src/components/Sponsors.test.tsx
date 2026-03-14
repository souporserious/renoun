import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const originalFetch = globalThis.fetch
const originalSponsorsToken = process.env['GITHUB_SPONSORS_TOKEN']

function createDeferred<Value>() {
  let resolvePromise!: (value: Value | PromiseLike<Value>) => void
  const promise = new Promise<Value>((resolve) => {
    resolvePromise = resolve
  })

  return {
    promise,
    resolve: resolvePromise,
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
    const { clearSponsorsCacheForTests } = await import('./Sponsors.tsx')
    clearSponsorsCacheForTests()
    vi.useRealTimers()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()

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

  it('prunes expired cache variants when new sponsor cache keys are created', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))

    const { Sponsors, getSponsorsCacheSizeForTests } = await import(
      './Sponsors.tsx'
    )
    process.env['GITHUB_SPONSORS_TOKEN'] = 'token-prune'

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

    await Sponsors({
      tiers: [{ amount: 100, title: 'Bronze', avatarSize: 64 }],
      cacheTtlMs: 25,
      children: () => <></>,
    })

    expect(getSponsorsCacheSizeForTests()).toBe(1)

    vi.setSystemTime(new Date('2026-01-01T00:00:01.000Z'))

    await Sponsors({
      tiers: [{ amount: 100, title: 'Bronze', avatarSize: 96 }],
      cacheTtlMs: 25,
      children: () => <></>,
    })

    expect(getSponsorsCacheSizeForTests()).toBe(1)
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('keeps the sponsors cache capped while distinct loads are still pending', async () => {
    const { Sponsors, getSponsorsCacheSizeForTests } = await import(
      './Sponsors.tsx'
    )
    process.env['GITHUB_SPONSORS_TOKEN'] = 'token-concurrent'

    const fetchGate = createDeferred<void>()
    const fetchMock = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
      await fetchGate.promise

      const url = typeof input === 'string' ? input : input.toString()
      if (url === 'https://api.github.com/graphql') {
        return createGraphqlResponse()
      }

      if (url === 'https://github.com/sponsors/renoun') {
        return createSponsorsPageResponse('renoun')
      }

      throw new Error(`Unexpected fetch URL: ${url}`)
    })

    globalThis.fetch = fetchMock as typeof fetch

    const renders = Array.from({ length: 40 }, (_, index) =>
      Sponsors({
        tiers: [{ amount: 100, title: 'Bronze', avatarSize: 64 + index }],
        children: () => <></>,
      })
    )

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(40)
    })

    expect(getSponsorsCacheSizeForTests()).toBeLessThanOrEqual(32)

    fetchGate.resolve()
    await Promise.all(renders)

    expect(getSponsorsCacheSizeForTests()).toBeLessThanOrEqual(32)
  })

  it('expires cached sponsor responses after the ttl window', async () => {
    const { Sponsors } = await import('./Sponsors.tsx')
    process.env['GITHUB_SPONSORS_TOKEN'] = `token-${Date.now()}`
    let now = 10_000
    vi.spyOn(Date, 'now').mockImplementation(() => now)

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
      cacheTtlMs: 1_000,
      children: () => <></>,
    })

    now += 500
    await Sponsors({
      tiers,
      cacheTtlMs: 1_000,
      children: () => <></>,
    })

    now += 1_001
    await Sponsors({
      tiers,
      cacheTtlMs: 1_000,
      children: () => <></>,
    })

    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('partitions cached sponsor responses by resolved ttl', async () => {
    const { Sponsors } = await import('./Sponsors.tsx')
    process.env['GITHUB_SPONSORS_TOKEN'] = `token-${Date.now()}`
    let now = 10_000
    vi.spyOn(Date, 'now').mockImplementation(() => now)

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

    now += 1_500
    await Sponsors({
      tiers,
      cacheTtlMs: 1_000,
      children: () => <></>,
    })

    expect(fetchMock).toHaveBeenCalledTimes(4)
  })
})
