import { SignupForm } from '../SignupForm'

export function JoinButton() {
  return (
    <div
      css={{
        width: '100%',
        maxWidth: '56rem',
        padding: '1.75rem 1.5rem',
        borderRadius: '1.25rem',
        backgroundColor: 'var(--color-surface-secondary)',
        border: '1px solid var(--color-separator-secondary)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '1.25rem',
        textAlign: 'center',

        '@media (min-width: 60rem)': {
          padding: '2rem 2.25rem',
        },
      }}
    >
      <div
        css={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
          maxWidth: '42rem',
        }}
      >
        <p
          css={{
            margin: 0,
            fontWeight: 600,
            color: 'var(--color-foreground)',
            fontSize: 'var(--font-size-body-2)',
            lineHeight: 'var(--line-height-body-2)',
          }}
        >
          Get updates by email.
        </p>
        <p
          css={{
            margin: 0,
            color: 'hsla(210, 100%, 90%, 0.85)',
            fontSize: 'var(--font-size-body-2)',
            lineHeight: 'var(--line-height-body-2)',
          }}
        >
          Learn how to get the most out of the renoun SDK.
        </p>
      </div>

      <SignupForm />
    </div>
  )
}
