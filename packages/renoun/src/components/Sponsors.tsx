import 'server-only'
import React from 'react'

interface SponsorEntity {
  username: string
  [key: `avatar_${number}`]: string | undefined
}

interface Sponsor {
  createdAt: string
  sponsorEntity: SponsorEntity | null
  tier: {
    monthlyPriceInCents: number
  }
  tierSelectedAt: string | null
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
function parseAvatarSize(sizeInPixels: number): number {
  const clampedInput = Math.floor(
    Number.isFinite(sizeInPixels) ? sizeInPixels : AVATAR_MIN
  )
  return Math.max(AVATAR_MIN, Math.min(AVATAR_MAX, clampedInput))
}

/** Builds a string of avatar fields for the given sizes. */
function buildSanitizedAvatarFields(avatarSizes: readonly number[]) {
  return avatarSizes
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

/** Build the public checkout URL for a tier. */
function buildTierCheckoutUrl(login: string, tierId: string): string {
  return `https://github.com/sponsors/${login}/sponsorships?tier_id=${encodeURIComponent(
    tierId
  )}`
}

type TierInput<Data extends object> = {
  /** The title of the tier defined in the GitHub Sponsors settings. */
  title: string

  /** Desired avatar size in pixels. If omitted, a default value based on the tier index is used. */
  avatarSize?: number

  /** The numeric GitHub Sponsors `tier_id` to link directly to. This will skip scraping for this tier. */
  tierId?: string | number
} & Data

type TierResolved<Data extends object> = {
  /** The title of the tier defined in the GitHub Sponsors settings. */
  title: string

  /** The minimum amount of money this tier is worth in USD. */
  minAmount: number

  /** A direct link to the GitHub checkout page for this tier. */
  href: string

  /** The sponsors for this tier. */
  sponsors: PublicSponsor[]
} & Data

/** Fetches sponsors and groups them by tier. */
type TierWithAmount<Data extends object> = TierInput<Data> & { amount: number }

/** Single network call: fetch sponsors + sponsorable login + map tier HTML → closest tier_id link. */
async function fetchSponsorsAndTierLinks(
  options: FetchSponsorsOptions & {
    avatarSizes: readonly number[]
    manualTierIds?: ReadonlyMap<string, string>
  }
): Promise<{
  hrefByTitle: Map<string, string>
  sponsors: MaintainerSponsor[]
  defaultHref: string
}> {
  const token = process.env['GITHUB_SPONSORS_TOKEN']

  if (!token) {
    // Skip erroring in Vercel/Netlify previews
    if (
      process.env['VERCEL_ENV'] === 'preview' ||
      process.env['CONTEXT'] === 'deploy-preview' ||
      process.env['CONTEXT'] === 'branch-deploy'
    ) {
      // Without a token, we don't know the login. Default to generic sponsors page.
      return {
        hrefByTitle: new Map(),
        sponsors: [],
        defaultHref: 'https://github.com/sponsors',
      }
    }

    throw new Error(
      '[renoun] GITHUB_SPONSORS_TOKEN must be set when using the <Sponsors /> component.'
    )
  }

  const graphqlVariables = {
    first: Math.max(1, Math.min(100, Math.floor(options.amount))),
  }

  const graphqlQuery = `
    query($first: Int!) {
      viewer {
        login
        sponsorsListing {
          tiers(first: 20) {
            nodes {
              name
              description
              descriptionHTML
              isOneTime
              monthlyPriceInCents
              adminInfo {
                isPublished
                isRetired
              }
            }
          }
        }
        sponsorshipsAsMaintainer(
          first: $first
          activeOnly: true
          includePrivate: false
        ) {
          nodes {
            createdAt
            sponsorEntity {
              ... on User {
                username: login
                ${buildSanitizedAvatarFields(options.avatarSizes)}
              }
            }
            tier {
              monthlyPriceInCents
            }
            tierSelectedAt
          }
        }
      }
    }
  `

  const graphqlResponse = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'renoun',
    },
    body: JSON.stringify({ query: graphqlQuery, variables: graphqlVariables }),
  })

  if (!graphqlResponse.ok) {
    throw new Error(
      `[renoun] GitHub Sponsors request failed (${graphqlResponse.status}). ${hintForStatus(graphqlResponse.status)}`
    )
  }

  const graphqlResponseJson = await graphqlResponse.json()

  if (graphqlResponseJson.errors) {
    if (process.env['NODE_ENV'] === 'development') {
      throw new Error(
        `[renoun] GitHub Sponsors GraphQL request failed with the following errors: ${JSON.stringify(
          graphqlResponseJson.errors
        )}`
      )
    } else {
      throw new Error(
        `[renoun] GitHub Sponsors GraphQL request failed with errors.`
      )
    }
  }

  const viewer = graphqlResponseJson.data.viewer as {
    login: string
    sponsorsListing: {
      tiers: {
        nodes: Array<{
          id: string
          name: string
          descriptionHTML: string
          isOneTime: boolean
          monthlyPriceInCents: number
          adminInfo?: {
            isPublished: boolean
            isRetired: boolean
          }
        }>
      }
    } | null
    sponsorshipsAsMaintainer: {
      nodes: Sponsor[]
    }
  }

  const publicSponsors: MaintainerSponsor[] = []

  for (const sponsor of viewer.sponsorshipsAsMaintainer.nodes) {
    if (!sponsor.sponsorEntity) {
      continue
    }

    const entity: SponsorEntity = { username: sponsor.sponsorEntity.username }

    for (const sponsorEntityKey of Object.keys(sponsor.sponsorEntity)) {
      if (sponsorEntityKey.startsWith('avatar_')) {
        // @ts-expect-error
        entity[sponsorEntityKey] = sponsor.sponsorEntity[sponsorEntityKey]
      }
    }

    publicSponsors.push({
      entity,
      dollars: sponsor.tier.monthlyPriceInCents / 100,
      startedAt: Date.parse(sponsor.tierSelectedAt ?? sponsor.createdAt),
    })
  }

  // Build hrefs for published, non-retired monthly tiers.
  const hrefByTitle = new Map<string, string>()
  const hrefByAmount = new Map<number, string>()
  const tierNodes = viewer.sponsorsListing?.tiers?.nodes ?? []

  // Skip scraping if all relevant tiers supplied
  const relevantTierNodes = tierNodes.filter((tierNode) => {
    const isPublished = tierNode.adminInfo?.isPublished ?? true
    const isRetired = tierNode.adminInfo?.isRetired ?? false
    return isPublished && !isRetired && !tierNode.isOneTime
  })

  let manualMappedCount = 0

  if (options.manualTierIds && options.manualTierIds.size > 0) {
    for (const tierNode of relevantTierNodes) {
      const manualTierId = options.manualTierIds.get(
        tierNode.name.toLowerCase()
      )
      if (manualTierId) {
        const linkHref = buildTierCheckoutUrl(
          viewer.login,
          String(manualTierId)
        )
        hrefByTitle.set(tierNode.name.toLowerCase(), linkHref)
        hrefByAmount.set(tierNode.monthlyPriceInCents, linkHref)
        manualMappedCount++
      }
    }

    if (manualMappedCount === relevantTierNodes.length) {
      const resolver = new Map<string, string>()
      for (const [key, value] of hrefByTitle) {
        resolver.set(key, value)
      }
      for (const [amountCents, value] of hrefByAmount) {
        resolver.set(`$${amountCents}`, value)
      }
      return {
        hrefByTitle: resolver,
        sponsors: publicSponsors,
        defaultHref: `https://github.com/sponsors/${viewer.login}`,
      }
    }
  }

  // Scrape public page for any missing tiers
  let sponsorsPageHtml = ''

  try {
    const pageResponse = await fetch(
      `https://github.com/sponsors/${viewer.login}`,
      { headers: { 'User-Agent': 'renoun', Accept: 'text/html' } }
    )
    if (pageResponse.ok) {
      sponsorsPageHtml = await pageResponse.text()
    }
  } catch {
    // skip link mapping if this fails.
  }

  // scan all plain and percent-encoded tier_id anchors within return_to
  const anchorRegex = /sponsorships(?:\?|%3[fF])tier_id(?:=|%3[dD])(\d+)/g
  const anchorMatches: Array<{ tierId: string; index: number }> = []

  if (sponsorsPageHtml) {
    for (const match of sponsorsPageHtml.matchAll(anchorRegex)) {
      anchorMatches.push({ tierId: match[1], index: match.index ?? 0 })
    }
  }

  function nearestTierIdForSnippet(snippetHTML: string): string | undefined {
    if (!sponsorsPageHtml || !anchorMatches.length) {
      return undefined
    }

    const snippetIndex = sponsorsPageHtml.indexOf(snippetHTML)
    if (snippetIndex === -1) {
      return undefined
    }

    let bestMatch: { tierId: string; distance: number } | undefined

    for (const anchor of anchorMatches) {
      const distance = Math.abs(anchor.index - snippetIndex)
      if (!bestMatch || distance < bestMatch.distance) {
        bestMatch = { tierId: anchor.tierId, distance }
      }
    }

    return bestMatch?.tierId
  }

  for (const tierNode of relevantTierNodes) {
    // Skip tiers already set via manual map
    if (hrefByTitle.has(tierNode.name.toLowerCase())) {
      continue
    }

    const matchedTierId = nearestTierIdForSnippet(tierNode.descriptionHTML)

    if (matchedTierId) {
      const linkHref = buildTierCheckoutUrl(viewer.login, matchedTierId)
      hrefByTitle.set(tierNode.name.toLowerCase(), linkHref)
      hrefByAmount.set(tierNode.monthlyPriceInCents, linkHref)
    }
  }

  const resolver = new Map<string, string>()
  for (const [key, value] of hrefByTitle) {
    resolver.set(key, value)
  }
  for (const [amountCents, value] of hrefByAmount) {
    resolver.set(`$${amountCents}`, value)
  }

  return {
    hrefByTitle: resolver,
    sponsors: publicSponsors,
    defaultHref: `https://github.com/sponsors/${viewer.login}`,
  }
}

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
          (data as TierInput<Data>).avatarSize ?? AVATAR_MIN * (index + 1)
        ),
      },
    }))
    .sort((a, b) => a.minAmount - b.minAmount)

  const avatarSizes = Array.from(
    new Set(tierList.map((tier) => tier.data.avatarSize))
  ).sort((a, b) => a - b)

  // Build manual tierId map keyed by lower-cased title.
  const manualTierIds = new Map<string, string>()
  for (const { data } of tierList) {
    const maybeTierId = (data as TierInput<Data>).tierId
    if (maybeTierId !== undefined && maybeTierId !== null) {
      manualTierIds.set(
        (data as TierInput<Data>).title.toLowerCase(),
        String(maybeTierId)
      )
    }
  }

  const { sponsors, hrefByTitle, defaultHref } =
    await fetchSponsorsAndTierLinks({
      ...options,
      avatarSizes,
      manualTierIds: manualTierIds.size > 0 ? manualTierIds : undefined,
    })

  const sponsorsByTitle = new Map<
    string,
    Array<PublicSponsor & { startedAt: number }>
  >()

  for (const { dollars, entity, startedAt } of sponsors) {
    const matchedTierIndex = tierList.findIndex((tier, tierIndex) => {
      const nextTier = tierList[tierIndex + 1]
      return (
        dollars >= tier.minAmount && (!nextTier || dollars < nextTier.minAmount)
      )
    })

    if (matchedTierIndex === -1) {
      continue
    }

    const { title } = tierList[matchedTierIndex].data as TierInput<Data>
    const listOfSponsors = sponsorsByTitle.get(title) ?? []
    const requestedSize = tierList[matchedTierIndex].data.avatarSize
    const exactAvatarKey = `avatar_${requestedSize}` as const
    let avatarUrl = entity[exactAvatarKey]

    // Fallback to closest available size
    if (!avatarUrl) {
      const availableSizes = Object.keys(entity)
        .filter((key) => key.startsWith('avatar_'))
        .map((key) => Number(key.replace('avatar_', '')))
        .filter((value) => Number.isFinite(value)) as number[]

      if (availableSizes.length > 0) {
        const closestAvailableSize = availableSizes.reduce(
          (previous, current) =>
            Math.abs(current - requestedSize) <
            Math.abs(previous - requestedSize)
              ? current
              : previous
        )
        avatarUrl = entity[`avatar_${closestAvailableSize}`]
      }
    }

    if (avatarUrl) {
      listOfSponsors.push({ username: entity.username, avatarUrl, startedAt })
    }

    sponsorsByTitle.set(title, listOfSponsors)
  }

  return tierList.toReversed().map(({ data, minAmount }) => {
    const { title } = data as TierInput<Data>
    const sponsorsList = sponsorsByTitle.get(title) ?? []
    const sortedSponsors = sponsorsList
      .slice()
      .sort((a, b) => a.startedAt - b.startedAt)
    const sanitizedSponsors: PublicSponsor[] = sortedSponsors.map(
      ({ username, avatarUrl }) => ({ username, avatarUrl })
    )

    // resolve href by case-insensitive title, or amount in cents
    const href =
      hrefByTitle.get(title.toLowerCase()) ??
      hrefByTitle.get(`$${Math.round(minAmount * 100)}`) ??
      defaultHref
    const {
      avatarSize: _omitSize,
      tierId: _omitTierId,
      ...rest
    } = data as TierInput<Data>

    return {
      ...(rest as Data & { title: string }),
      sponsors: sanitizedSponsors,
      href,
    } as TierResolved<Data>
  })
}

export interface SponsorsProps<Data extends object> {
  /** A list of tiers with the minimum monthly amount (in USD). */
  tiers: ReadonlyArray<TierWithAmount<Data>>

  /** Receives tiers (with your Data) and sanitized sponsors. */
  children: (tiers: Array<TierResolved<Data>>) => React.ReactNode
}

/** Renders a list of GitHub sponsors grouped by tier. */
export async function Sponsors<const Data extends object>({
  tiers,
  children,
}: SponsorsProps<Data>) {
  const resolvedTiers = await fetchSponsorTiers<Data>(tiers, { amount: 100 })
  return children(resolvedTiers)
}
