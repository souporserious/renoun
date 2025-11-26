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
          I really appreciate your support. Please check your email for your
          purchase receipt. You should now have access to the repository
          containing the template and access to the Discord server for help.
        </p>
      </div>
    </div>
  )
}
