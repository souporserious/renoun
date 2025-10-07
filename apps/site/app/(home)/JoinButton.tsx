'use client'

import { useState } from 'react'

import { SignupForm } from '../SignupForm'

export function JoinButton() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div
      css={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '2rem',
        width: '100%',
      }}
    >
      {!isOpen ? (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          css={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.75rem',
            padding: '0.95rem 2.25rem',
            borderRadius: '999px',
            border: '1px solid transparent',
            backgroundColor: 'var(--color-surface-accent)',
            color: '#0c0900',
            fontWeight: 'var(--font-weight-button)',
            fontSize: 'var(--font-size-button-1)',
            cursor: 'pointer',
            transition: 'transform 150ms ease, box-shadow 200ms ease',
            boxShadow: '0 18px 36px rgba(247, 201, 72, 0.18)',

            ':hover': {
              transform: 'translateY(-2px)',
              boxShadow: '0 24px 48px rgba(247, 201, 72, 0.24)',
            },
            ':focus-visible': {
              outline: 'none',
              boxShadow:
                '0 0 0 3px rgba(12, 9, 0, 0.3), 0 0 0 6px rgba(247, 201, 72, 0.45)',
            },
          }}
        >
          Join renoun
          <span
            aria-hidden="true"
            css={{
              display: 'inline-flex',
              alignItems: 'center',
            }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 18 18"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M6.46967 4.21967L7.53033 3.15899L12.8713 8.5L7.53033 13.841L6.46967 12.7803L10.25 8.99999H3.5V7.99999H10.25L6.46967 4.21967Z"
                fill="#0c0900"
              />
            </svg>
          </span>
        </button>
      ) : null}

      {isOpen ? (
        <div
          css={{
            display: 'grid',
            gap: '2.5rem',
            width: '100%',
            textAlign: 'left',
            alignItems: 'start',
            '@media (min-width: 56rem)': {
              gridTemplateColumns: 'minmax(0, 22rem) minmax(0, 1fr)',
            },
          }}
        >
          <div
            css={{
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
              fontSize: 'var(--font-size-body-1)',
              lineHeight: 1.6,
              color: 'hsla(210, 100%, 90%, 0.85)',
            }}
          >
            <p
              css={{
                margin: 0,
                fontWeight: 600,
                color: 'var(--color-foreground)',
              }}
            >
              Real quick.
            </p>
            <p css={{ margin: 0 }}>
              Would you like to learn how to get the most out of how to use
              renoun? Enter your email below, if not, feel free to press{' '}
              <kbd
                css={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '0.4rem',
                  padding: '0.15rem 0.6rem',
                  margin: '0 0.35rem',
                  backgroundColor: 'rgba(255, 255, 255, 0.08)',
                  fontSize: '0.875em',
                  lineHeight: 1.2,
                }}
              >
                enter
              </kbd>{' '}
              to continue.
            </p>
          </div>
          <SignupForm autoFocus />
        </div>
      ) : null}
    </div>
  )
}
