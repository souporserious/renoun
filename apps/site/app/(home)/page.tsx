import { CodeInline } from 'renoun/components'

import { SignupForm } from '../SignupForm'
import { Text } from '@/components/Text'
import Link from 'next/link'
import { styled } from 'restyle'

const ButtonLink = styled(Link, {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontWeight: 600,
  padding: '0.5rem 1.25rem',
  borderRadius: '0.25rem',
  backgroundColor: 'var(--color-surface-primary)',
  color: 'var(--color-foreground)',
  fontSize: 'var(--font-size-button)',

  ':hover': {
    backgroundColor: 'var(--color-surface-primary-highlighted)',
    textDecoration: 'none !important',
  },

  '@media (min-width: 60rem)': {
    padding: '0 0.75rem',
  },
})

export default function Page() {
  return (
    <div
      css={{
        gridColumn: '1 / -1',
        display: 'flex',
        flexDirection: 'column',
        gap: '4rem',

        '@media (min-width: 60rem)': {
          padding: '4rem 8rem',
        },
      }}
    >
      <div className="prose" css={{ maxWidth: '45rem' }}>
        <h1
          css={{
            fontSize: 'var(--font-size-heading)',
            textWrap: 'balance',
            margin: 0,
          }}
        >
          Elevate Every Stage of Your JavaScript Documentation
        </h1>
        <p
          css={{
            fontSize: 'var(--font-size-body)',
            lineHeight: 'var(--line-height-body)',
            letterSpacing: '0.01em',
            textWrap: 'balance',
            margin: 0,
          }}
        >
          Meticulously crafted React components and utilities to build
          documentation with the same quality you put into your product.
        </p>
        <div css={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
          <ButtonLink href="/docs/getting-started">Get Started</ButtonLink>
          <CodeInline
            allowCopy
            value={`npm install renoun`}
            language="bash"
            paddingX="0.8em"
            paddingY="0.5em"
            css={{
              alignSelf: 'start',
              fontSize: 'var(--font-size-code)',
            }}
          />
        </div>
      </div>
      <div
        css={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '4rem 4rem 6rem',
          gap: '3rem',
          background: 'var(--color-surface-secondary)',
          borderRadius: '0.5rem',
        }}
      >
        <div
          css={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '1rem',
          }}
        >
          <Text variant="heading-2">Stay Updated</Text>
        </div>
        <SignupForm />
      </div>
    </div>
  )
}
