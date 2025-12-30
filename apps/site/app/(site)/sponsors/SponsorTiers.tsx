import { Sponsors } from 'renoun'

export const tiers = [
  {
    amount: 1000,
    title: 'Diamond',
    icon: '💎',
  },
  {
    amount: 500,
    title: 'Gold',
    icon: '🥇',
  },
  {
    amount: 250,
    title: 'Silver',
    icon: '🥈',
  },
  {
    amount: 100,
    title: 'Bronze',
    icon: '🥉',
  },
] as const

type SponsorTier = (typeof tiers)[number] & {
  href: string
  sponsors: { username: string; avatarUrl: string }[]
}

const SPONSOR_BASE_URL = 'https://github.com/sponsors/souporserious'

function renderTierSections(tiers: SponsorTier[]) {
  return (
    <div
      css={{
        display: 'flex',
        flexDirection: 'column',
        gap: '3rem',
      }}
    >
      {tiers.map((tier) => {
        const id = tier.title.toLowerCase()

        if (tier.sponsors.length === 0) {
          return (
            <section
              key={tier.title}
              id={id}
              css={{
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
              }}
            >
              <h3>
                {tier.icon} {tier.title}
              </h3>
              <div
                css={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '1rem',
                  minHeight: '16rem',
                  backgroundColor: 'var(--color-surface-secondary)',
                }}
              >
                <p>
                  Become the first <strong>{tier.title}</strong> sponsor
                </p>
                <SponsorLink tier={tier.title} href={tier.href} />
              </div>
            </section>
          )
        }

        return (
          <section
            key={tier.title}
            id={id}
            css={{
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
            }}
          >
            <div
              css={{
                display: 'flex',
                gap: '1rem',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <h3 css={{ margin: '0 !important' }}>
                {tier.icon} {tier.title}
              </h3>
              <SponsorLink tier={tier.title} href={tier.href} variant="small" />
            </div>
            <ul
              css={{
                listStyle: 'none',
                display: 'flex',
                flexWrap: 'wrap',
                minHeight: '16rem',
                padding: '1rem',
                margin: 0,
                gap: '1rem',
                backgroundColor: 'var(--color-surface-secondary)',
              }}
            >
              {tier.sponsors.map((sponsor) => (
                <li key={sponsor.username}>
                  <a href={`https://github.com/${sponsor.username}`}>
                    <img
                      src={sponsor.avatarUrl}
                      alt={`${sponsor.username}'s avatar`}
                      title={sponsor.username}
                      css={{ width: '4rem', borderRadius: '100%' }}
                    />
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

export function SponsorTiers() {
  if (!process.env.GITHUB_SPONSORS_TOKEN) {
    const fallbackTiers: SponsorTier[] = tiers.map((tier) => ({
      ...tier,
      href: `${SPONSOR_BASE_URL}?amount=${tier.amount}`,
      sponsors: [],
    }))

    return renderTierSections(fallbackTiers)
  }

  return (
    <Sponsors tiers={tiers}>
      {(resolvedTiers) => renderTierSections(resolvedTiers as SponsorTier[])}
    </Sponsors>
  )
}

function SponsorLink({
  tier,
  href,
  variant = 'medium',
}: {
  tier: string
  href: string
  variant?: 'small' | 'medium'
}) {
  return (
    <a
      href={href}
      css={{
        fontSize:
          variant === 'small'
            ? 'var(--font-size-body-3)'
            : 'var(--font-size-body-2)',
        fontWeight: 'var(--font-weight-button)',
        display: 'inline-flex',
        padding: variant === 'small' ? '0.25rem 0.75rem' : '0.5rem 1rem',
        borderRadius: '0.25rem',
        backgroundColor: '#db61a2',
        color: 'white',
      }}
    >
      Sponsor {tier}
    </a>
  )
}
