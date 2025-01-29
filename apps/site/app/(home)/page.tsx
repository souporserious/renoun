import { CodeInline } from 'renoun/components'

import { ButtonLink } from '@/components/ButtonLink'
import { Text } from '@/components/Text'
import { SignupForm } from '../SignupForm'
import { QuickSteps } from './QuickSteps'

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
      <div
        className="prose"
        css={{
          alignSelf: 'center',
          textAlign: 'center',
          gap: '2rem',

          '@media (min-width: 60rem)': {
            maxWidth: '60ch',
          },
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
          The Documentation Toolkit for React
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
          Meticulously crafted React components and utilities to help you create
          engaging content and documentation.
        </p>
        <div
          css={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            gap: '1rem',

            '@media (min-width: 60rem)': {
              flexDirection: 'row',
            },
          }}
        >
          <ButtonLink href="/docs/getting-started">Start Writing</ButtonLink>
          <CodeInline
            allowCopy
            value={`npm create renoun`}
            language="bash"
            paddingX="0.8em"
            paddingY="0.5em"
            css={{ fontSize: 'var(--font-size-code-1)' }}
          />
        </div>
      </div>

      <QuickSteps />

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
