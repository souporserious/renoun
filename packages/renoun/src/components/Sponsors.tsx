import 'server-only'
import React from 'react'

interface SponsorEntity {
  username: string
  [key: `avatar_${number}`]: string | undefined
}

interface Sponsor {
  privacyLevel: 'PUBLIC' | 'PRIVATE'
  createdAt: string
  tierSelectedAt: string | null
  sponsorEntity: SponsorEntity | null
  tier: {
    name: string
    monthlyPriceInCents: number
  }
}

interface MaintainerSponsor {
  entity: SponsorEntity
  dollars: number
  startedAt: number
}

interface PublicSponsor {
  username: string
  avatarUrl: string
}

interface FetchSponsorsOptions {
  amount: number
}

const AVATAR_MIN = 64
const AVATAR_MAX = 512

/** Clamp and sanitize avatar size. */
function parseAvatarSize(number: number): number {
  const value = Math.floor(Number.isFinite(number) ? number : AVATAR_MIN)
  return Math.max(AVATAR_MIN, Math.min(AVATAR_MAX, value))
}

/** Builds a string of avatar fields for the given sizes. */
function buildAvatarFields(sizes: readonly number[]) {
  return sizes
    .map((size) => {
      const sanitizedSize = parseAvatarSize(size)
      return `avatar_${sanitizedSize}: avatarUrl(size: ${sanitizedSize})`
    })
    .join('\n')
}

function hintForStatus(status: number): string {
  switch (status) {
    case 401:
      return 'Unauthorized — make sure GITHUB_SPONSORS_TOKEN exists in this environment and is valid and has not expired. Create a token here: https://github.com/settings/personal-access-tokens'
    case 403:
      return 'Forbidden — token lacks permission or an organization policy is blocking PAT access. Verify scopes/permissions or switch to a GitHub App / request org approval.'
    case 404:
      return 'Not found — check the GraphQL endpoint and that the token targets the correct account/org.'
    case 429:
      return 'Rate limited — wait for the reset window or cache results.'
    default:
      return 'Unexpected response from GitHub.'
  }
}

/** Fetches GitHub sponsors for the authenticated user. */
async function fetchSponsors(
  options: FetchSponsorsOptions & { avatarSizes: readonly number[] }
) {
  const token = process.env['GITHUB_SPONSORS_TOKEN']

  if (!token) {
    // Skip erroring in Vercel and Netlify preview deployments
    if (
      process.env['VERCEL_ENV'] === 'preview' ||
      process.env['CONTEXT'] === 'deploy-preview' ||
      process.env['CONTEXT'] === 'branch-deploy'
    ) {
      return [] as MaintainerSponsor[]
    }

    throw new Error(
      '[renoun] GITHUB_SPONSORS_TOKEN must be set when using the <Sponsors /> component.'
    )
  }

  const variables = {
    first: Math.max(1, Math.min(100, Math.floor(options.amount))),
  }
  const avatarSizes = options.avatarSizes
  const query = `
    query($first: Int!) {
      viewer {
        sponsorshipsAsMaintainer(first: $first) {
          nodes {
            createdAt
            privacyLevel
            sponsorEntity {
              ... on User {
                username: login
                ${buildAvatarFields(avatarSizes)}
              }
            }
            tier {
              name
              monthlyPriceInCents
            }
            tierSelectedAt
          }
        }
      }
    }
  `
  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'renoun',
    },
    body: JSON.stringify({ query, variables }),
  })

  if (!response.ok) {
    throw new Error(
      `[renoun] GitHub Sponsors request failed (${response.status}). ${hintForStatus(response.status)}`
    )
  }

  const json = await response.json()

  if (json.errors) {
    if (process.env['NODE_ENV'] === 'development') {
      throw new Error(
        `[renoun] GitHub Sponsors GraphQL request failed with the following errors: ${JSON.stringify(json.errors)}`
      )
    } else {
      throw new Error(
        `[renoun] GitHub Sponsors GraphQL request failed with errors.`
      )
    }
  }

  const nodes = json.data.viewer.sponsorshipsAsMaintainer.nodes as Sponsor[]
  const publicSponsors: MaintainerSponsor[] = []

  for (const sponsor of nodes) {
    if (sponsor.privacyLevel !== 'PUBLIC') {
      continue
    }

    if (!sponsor.sponsorEntity) {
      continue
    }

    const entity: SponsorEntity = { username: sponsor.sponsorEntity.username }

    for (const key of Object.keys(sponsor.sponsorEntity)) {
      if (key.startsWith('avatar_')) {
        // @ts-expect-error
        entity[key] = sponsor.sponsorEntity[key]
      }
    }

    publicSponsors.push({
      entity,
      dollars: sponsor.tier.monthlyPriceInCents / 100,
      startedAt: Date.parse(sponsor.tierSelectedAt ?? sponsor.createdAt),
    })
  }

  return publicSponsors
}

type TierInput<Data extends object> = {
  /** The title of the tier defined in the GitHub Sponsors settings. */
  title: string

  /** Desired avatar size in pixels. If omitted, a default value based on the tier index is used. */
  avatarSize?: number
} & Data

type TierResolved<Data extends object> = {
  title: string
  sponsors: PublicSponsor[]
} & Data

/** Fetches sponsors and groups them by tier. */
type TierWithAmount<Data extends object> = TierInput<Data> & { amount: number }

async function fetchSponsorTiers<const Data extends object>(
  tiers: ReadonlyArray<TierWithAmount<Data>>,
  options: FetchSponsorsOptions
): Promise<Array<TierResolved<Data>>> {
  const tierList = tiers
    .map(({ amount, ...data }, index) => ({
      minAmount: Number(amount),
      data: {
        ...data,
        avatarSize: parseAvatarSize(
          data.avatarSize ?? AVATAR_MIN * (index + 1)
        ),
      },
    }))
    .sort((a, b) => a.minAmount - b.minAmount)
  const avatarSizes = Array.from(
    new Set(tierList.map((tier) => tier.data.avatarSize))
  ).sort((a, b) => a - b)
  const sponsors = await fetchSponsors({ ...options, avatarSizes })
  const sponsorsByTitle = new Map<
    string,
    Array<PublicSponsor & { startedAt: number }>
  >()

  for (const { dollars, entity, startedAt } of sponsors) {
    const index = tierList.findIndex((tier, tierIndex) => {
      const next = tierList[tierIndex + 1]
      return dollars >= tier.minAmount && (!next || dollars < next.minAmount)
    })
    if (index === -1) {
      continue
    }

    const { title } = tierList[index].data
    const sponsors = sponsorsByTitle.get(title) ?? []
    const requestedSize = tierList[index].data.avatarSize
    const exactKey = `avatar_${requestedSize}` as const
    let avatarUrl = entity[exactKey]

    // Fallback to the closest available size if the requested size is not available
    if (!avatarUrl) {
      const available = Object.keys(entity)
        .filter((key) => key.startsWith('avatar_'))
        .map((key) => Number(key.replace('avatar_', '')))
        .filter((number) => Number.isFinite(number)) as number[]

      if (available.length > 0) {
        const closest = available.reduce((previous, current) =>
          Math.abs(current - requestedSize) < Math.abs(previous - requestedSize)
            ? current
            : previous
        )
        avatarUrl = entity[`avatar_${closest}`]
      }
    }

    if (avatarUrl) {
      sponsors.push({
        username: entity.username,
        avatarUrl,
        startedAt,
      })
    }

    sponsorsByTitle.set(title, sponsors)
  }

  return tierList.toReversed().map(({ data }) => {
    const sponsorsList = sponsorsByTitle.get(data.title) ?? []
    const sortedSponsors = sponsorsList
      .slice()
      .sort((a, b) => a.startedAt - b.startedAt)
    const sanitizedSponsors: PublicSponsor[] = sortedSponsors.map(
      ({ username, avatarUrl }) => ({
        username,
        avatarUrl,
      })
    )
    const { avatarSize: _omitAvatarSize, ...rest } = data
    return {
      ...(rest as unknown as Data & { title: string }),
      sponsors: sanitizedSponsors,
    } as TierResolved<Data>
  })
}

export interface SponsorsProps<Data extends object> {
  /** A list of tiers with the minimum monthly amount (in USD). */
  tiers: ReadonlyArray<TierWithAmount<Data>>

  /** The number of sponsors to fetch. */
  amount?: number

  /** Receives tiers (with your Data) and sanitized sponsors. */
  children: (tiers: Array<TierResolved<Data>>) => React.ReactNode
}

/** Renders a list of GitHub sponsors grouped by tier. */
export async function Sponsors<const Data extends object>({
  tiers,
  amount = 100,
  children,
}: SponsorsProps<Data>) {
  const resolvedTiers = await fetchSponsorTiers<Data>(tiers, { amount })
  return children(resolvedTiers)
}
