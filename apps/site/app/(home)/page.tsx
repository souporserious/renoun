import { Mark } from '@/components/Mark'
import { JoinButton } from './JoinButton'

export default function Page() {
  return (
    <div
      data-grid="manual"
      css={{
        gridColumn: '2 / -2',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '2.5rem',
        padding: '0 1.75rem 7rem',
        textAlign: 'center',

        '@media (min-width: 60rem)': {
          // Span the full subgrid so the hero doesn't get cramped
          gridColumn: '1 / -1',
          padding: '2rem 2.5rem 9rem',
        },
      }}
    >
      <section
        css={{
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '2rem',
          maxWidth: '88rem',
        }}
      >
        <div
          css={{
            display: 'grid',
            gap: '2.5rem',
            width: '100%',
            padding: '2rem 0',

            '@media (min-width: 60rem)': {
              gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 1fr)',
              gap: '4rem',
              padding: '4rem 0',
            },
          }}
        >
          <h1
            css={{
              fontSize: 'clamp(3.2rem, 8vw, 6rem)',
              lineHeight: 1.03,
              letterSpacing: '-0.03em',
              margin: 0,
              textWrap: 'balance',
              textAlign: 'center',

              '@media (min-width: 60rem)': {
                textAlign: 'left',
              },
            }}
          >
            Your Repo Has
            <br />a Lot to Say
          </h1>

          <div
            css={{
              display: 'flex',
              flexDirection: 'column',
              gap: '1.5rem',
              alignItems: 'center',
              maxWidth: '38rem',
              justifySelf: 'center',

              '@media (min-width: 60rem)': {
                alignItems: 'flex-start',
                textAlign: 'left',
                justifySelf: 'end',
              },
            }}
          >
            <p
              css={{
                fontSize: 'clamp(1.6rem, 4.4vw, 2.1rem)',
                lineHeight: 'clamp(2.2rem, 6vw, 2.9rem)',
                textWrap: 'pretty',
                color: 'hsla(210, 100%, 90%, 0.85)',
                margin: 0,

                '@media (min-width: 60rem)': {
                  fontSize: 'var(--font-size-heading-2)',
                  lineHeight: 'var(--line-height-heading-2)',
                },
              }}
            >
              Turn your JavaScript, TypeScript, Markdown, and MDX into reusable
              structured data for blogs, docs, and presentations{' '}
              <Mark>
                so your content always matches what's in your codebase.
              </Mark>
            </p>

            <div
              css={{
                display: 'flex',
                gap: '0.75rem',
                flexWrap: 'wrap',
                justifyContent: 'center',
                width: '100%',
                alignItems: 'center',

                '@media (min-width: 60rem)': {
                  justifyContent: 'flex-start',
                  alignItems: 'flex-start',
                },
              }}
            >
              <a
                href="/docs/getting-started"
                css={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  padding: '0.75rem 1.75rem',
                  backgroundColor: 'var(--color-surface-accent)',
                  color: '#0c0900',
                  border: '1px solid var(--color-surface-accent)',
                  borderRadius: '999px',
                  fontSize: 'var(--font-size-button-1)',
                  fontWeight: 700,
                  textDecoration: 'none',
                  whiteSpace: 'nowrap',
                  width: 'fit-content',
                  transition: 'opacity 0.15s',

                  ':hover': {
                    opacity: 0.85,
                    color: '#0c0900',
                    textDecoration: 'none',
                  },
                  ':active': {
                    opacity: 0.75,
                    color: '#0c0900',
                  },
                  ':focus-visible': {
                    outline: '2px solid var(--color-surface-accent)',
                    outlineOffset: '2px',
                  },
                }}
              >
                Get Started
              </a>

              <a
                href="/docs/examples"
                css={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '0.75rem 1.75rem',
                  backgroundColor: 'var(--color-surface-interactive)',
                  color: 'var(--color-foreground)',
                  border: '1px solid var(--color-surface-accent)',
                  borderRadius: '999px',
                  fontSize: 'var(--font-size-button-1)',
                  fontWeight: 600,
                  textDecoration: 'none',
                  whiteSpace: 'nowrap',
                  width: 'fit-content',
                  transition: 'background-color 0.15s',

                  ':hover': {
                    backgroundColor:
                      'var(--color-surface-interactive-highlighted)',
                    color: 'var(--color-foreground)',
                    textDecoration: 'none',
                  },
                  ':active': {
                    backgroundColor: 'hsl(212deg 40% 18%)',
                    color: 'var(--color-foreground)',
                  },
                  ':focus-visible': {
                    outline: '2px solid var(--color-surface-accent)',
                    outlineOffset: '2px',
                  },
                }}
              >
                Explore Examples
              </a>
            </div>
          </div>
        </div>
      </section>

      <JoinButton />
    </div>
  )
}
