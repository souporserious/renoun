import Image from 'next/image'
import { ButtonLink } from '@/components/ButtonLink'

import preview from './preview.png'

export default function Templates() {
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
        css={{
          display: 'flex',
          flexDirection: 'column',
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
          Templates
        </h1>
        <p
          css={{
            fontSize: 'var(--font-size-heading-2)',
            lineHeight: 'var(--line-height-heading-2)',
            color: 'var(--color-foreground-secondary)',
            textWrap: 'balance',
          }}
        >
          Premium templates to help you get started with renoun.
        </p>
      </div>

      <div
        css={{
          padding: '8rem 4rem',
          borderRadius: '4rem',
          backgroundColor: '#1E2D3B',
        }}
      >
        <div
          css={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            maxWidth: '1200px',
            gap: '4rem',
            '@media (min-width: 60rem)': {
              flexDirection: 'row',
            },
          }}
        >
          <div
            css={{
              display: 'grid',
              gridAutoRows: 'min-content',
              rowGap: '1rem',
              maxWidth: '32ch',
            }}
          >
            <h2
              css={{
                fontSize: 'var(--font-size-heading-2)',
                fontWeight: 'var(--font-weight-heading)',
              }}
            >
              Design System Documentation
            </h2>
            <p
              css={{
                fontSize: 'var(--font-size-body)',
                lineHeight: 'var(--line-height-body)',
                color: 'var(--color-foreground-secondary)',
              }}
            >
              A comprehensive Next.js documentation site template for design
              systems with components, hooks, and utilities.
            </p>
            <div
              css={{
                display: 'grid',
                alignItems: 'center',
                columnGap: '1rem',
                '@media (min-width: 60rem)': {
                  gridTemplateColumns: 'auto 1fr auto',
                },
              }}
            >
              <span
                css={{
                  gridColumn: '1',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.1em',
                  fontSize: 'var(--font-size-heading-2)',
                  fontWeight: 'var(--font-weight-heading)',
                }}
              >
                <span
                  css={{
                    fontSize: '0.8em',
                    fontWeight: 'var(--font-weight-body)',
                    color: 'var(--color-foreground-secondary)',
                  }}
                >
                  $
                </span>
                300
              </span>
              <span
                css={{
                  gridColumn: '1 / 4',
                  gridRow: '2',
                  width: '14ch',
                  fontSize: 'var(--font-size-body-3)',
                  color: 'var(--color-foreground-secondary)',
                }}
              >
                single payment plus taxes
              </span>
              <div
                css={{
                  justifySelf: 'center',
                  gridColumn: '2',
                  width: '8rem',
                  height: 1,
                  backgroundColor: 'rgba(255, 255, 255, 0.3)',
                }}
              />
              <ButtonLink
                href="https://buy.stripe.com/7sI9EG6aLdm06MUdQQ"
                css={{
                  gridColumn: '3',
                }}
              >
                Purchase
              </ButtonLink>
            </div>
          </div>
          <div
            css={{
              flex: '1',
              minWidth: '300px',
              maxWidth: '500px',
              position: 'relative',
            }}
          >
            <div
              css={{
                display: 'block',
                position: 'relative',
                '&:hover > div': {
                  opacity: 1,
                },
                '&:focus-within > div': {
                  opacity: 1,
                },
              }}
            >
              <Image
                src={preview}
                alt="Design System Documentation Template Preview"
                style={{
                  maxWidth: '100%',
                  height: 'auto',
                }}
              />
              <div
                css={{
                  position: 'absolute',
                  inset: 0,
                  backgroundColor: '#0e132166',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: 0,
                  transition: 'opacity 0.2s ease-in-out',
                }}
              >
                <ButtonLink href="https://design-system.renoun.dev">
                  View Demo
                </ButtonLink>
              </div>
            </div>
          </div>
        </div>

        <div
          css={{
            maxWidth: '1200px',
            margin: '0 auto',
          }}
        >
          <h2
            css={{
              fontSize: 'var(--font-size-heading-2)',
              fontWeight: 'var(--font-weight-heading)',
              margin: '4rem 0',
            }}
          >
            Features
          </h2>
          <div
            css={{
              display: 'flex',
              flexDirection: 'column',
              gap: '40px',
            }}
          >
            <FeatureItem
              title="Next.js App Router"
              description="Advanced routing for seamless navigation and performance"
            />
            <FeatureItem
              title="Component Documentation"
              description="Auto-generated documentation with props tables and usage examples"
            />
            <FeatureItem
              title="MDX Support"
              description="Write documentation in MDX with full support for embedding live components"
            />
            <FeatureItem
              title="Theming"
              description="Easily customize colors, typography, spacing, and other design tokens or use your own design system"
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function FeatureItem({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <li
      css={{
        display: 'flex',
        gap: '1rem',
      }}
    >
      <svg
        width="1rem"
        height="1rem"
        viewBox="0 0 32 32"
        fill="none"
        css={{
          flexShrink: 0,
        }}
      >
        <path
          d="M30.6667 16C30.6667 24.1002 24.1002 30.6667 16 30.6667C7.89982 30.6667 1.33333 24.1002 1.33333 16C1.33333 7.89982 7.89982 1.33333 16 1.33333C24.1002 1.33333 30.6667 7.89982 30.6667 16Z"
          fill="#B58422"
          stroke="#79542F"
          strokeWidth="2.66667"
        />
        <path
          d="M22.0002 9.875L24.1216 11.9963C20.5165 15.601 16.7462 19.5394 13.0002 22.9963C13.0002 22.9963 9.04514 19.1625 7.87891 17.9963L10.0002 15.875L13.0002 18.875L22.0002 9.875Z"
          fill="white"
        />
      </svg>

      <div
        css={{
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
        }}
      >
        <h3
          css={{
            fontSize: 'var(--font-size-body-1)',
            textBox: 'trim-both cap alphabetic',
          }}
        >
          {title}
        </h3>
        <p
          css={{
            fontSize: 'var(--font-size-body-1)',
            textBox: 'trim-both cap alphabetic',
          }}
        >
          {description}
        </p>
      </div>
    </li>
  )
}
