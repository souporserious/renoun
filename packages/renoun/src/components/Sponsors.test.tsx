import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Sponsors } from './Sponsors.tsx'
import { NodeFileSystem } from '../file-system/NodeFileSystem.ts'
import { Session } from '../file-system/Session.ts'

const originalFetch = globalThis.fetch
const originalSponsorsToken = process.env['GITHUB_SPONSORS_TOKEN']
const originalSponsorsTtl = process.env['RENOUN_SPONSORS_CACHE_TTL_MS']
const SPONSORS_CACHE_PREFIX = 'component-sponsors:2:github-sponsors:'

async function clearSponsorsCache(): Promise<void> {
  const session = Session.for(new NodeFileSystem())
  const nodeKeys = await session.cache.listNodeKeysByPrefix(SPONSORS_CACHE_PREFIX)
  if (nodeKeys.length > 0) {
    await session.cache.deleteMany(nodeKeys)
  }
}

function createGraphqlResponse() {
  return new Response(
    JSON.stringify({
      data: {
        viewer: {
          login: 'renoun',
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
                  username: 'octocat',
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

function createSponsorsPageResponse() {
  return new Response(
    `
      <html>
        <body>
          <a href="/sponsors/renoun/sponsorships?tier_id=12345">Sponsor</a>
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
    await clearSponsorsCache()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch

    if (originalSponsorsToken === undefined) {
      delete process.env['GITHUB_SPONSORS_TOKEN']
    } else {
      process.env['GITHUB_SPONSORS_TOKEN'] = originalSponsorsToken
    }

    if (originalSponsorsTtl === undefined) {
      delete process.env['RENOUN_SPONSORS_CACHE_TTL_MS']
    } else {
      process.env['RENOUN_SPONSORS_CACHE_TTL_MS'] = originalSponsorsTtl
    }
  })

  it('reuses cached GitHub responses for repeated identical renders', async () => {
    process.env['GITHUB_SPONSORS_TOKEN'] = `token-${Date.now()}`
    process.env['RENOUN_SPONSORS_CACHE_TTL_MS'] = '600000'

    const fetchMock = vi.fn(
      async (input: RequestInfo | URL): Promise<Response> => {
        const url = typeof input === 'string' ? input : input.toString()
        if (url === 'https://api.github.com/graphql') {
          return createGraphqlResponse()
        }

        if (url === 'https://github.com/sponsors/renoun') {
          return createSponsorsPageResponse()
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
})
