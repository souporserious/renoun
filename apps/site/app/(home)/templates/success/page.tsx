import { ButtonLink } from '@/components/ButtonLink'

export default function TemplatePurchaseSuccess() {
  return (
    <div
      css={{
        gridColumn: '1 / -1',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '2rem',
        textAlign: 'center',

        '@media (min-width: 60rem)': {
          padding: '4rem 8rem',
        },
      }}
    >
      <div
        css={{
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          maxWidth: '60ch',
        }}
      >
        <h1
          css={{
            fontSize: 'var(--font-size-heading-0) !important',
            lineHeight: 'var(--line-height-heading-0) !important',
            textWrap: 'balance',
            margin: 0,
          }}
        >
          Thank you for your purchase!
        </h1>
        <p
          css={{
            fontSize: 'var(--font-size-heading-2)',
            lineHeight: 'var(--line-height-heading-2)',
            color: 'var(--color-foreground-secondary)',
            textWrap: 'balance',
            margin: 0,
          }}
        >
          I appreciate your support. If you have questions or need help getting
          started, reach out on Discord or X.
        </p>
      </div>

      <div
        css={{
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          '@media (min-width: 40rem)': {
            flexDirection: 'row',
            gap: '1.5rem',
          },
        }}
      >
        <ButtonLink href="https://discord.gg/7Mf4xEBYx9">
          Join Discord
        </ButtonLink>
        <ButtonLink href="https://x.com/renoun_dev" variant="secondary">
          Follow on X
        </ButtonLink>
      </div>
    </div>
  )
}
