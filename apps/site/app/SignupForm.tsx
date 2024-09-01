'use client'
import { useEffect, useRef, useState } from 'react'

export function SignupForm() {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [state, setState] = useState<'idle' | 'loading' | 'success' | 'error'>(
    'idle'
  )
  const timeoutId = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clearTimeoutId = () => {
    if (timeoutId.current) {
      clearTimeout(timeoutId.current)
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setState('loading')
    clearTimeoutId()

    try {
      let response = await fetch(
        'https://souporserious.lemonsqueezy.com/email-subscribe/external',
        { method: 'POST', body: new FormData(event.currentTarget) }
      )

      if (response.ok) {
        setMessage(
          `A confirmation email has been sent, please check your inbox.`
        )
      } else {
        setMessage(`Sorry, your subscription could not be processed.`)
      }
      setState('success')
      setEmail('')
      timeoutId.current = setTimeout(() => {
        setMessage(null)
        setState('idle')
      }, 5000)
    } catch (error) {
      if (error instanceof Error) {
        setMessage(`Sorry, there was an issue: ${error.message}`)
      }
      setState('error')
    }
  }

  useEffect(() => {
    return () => {
      clearTimeoutId()
    }
  }, [])

  return (
    <form
      data-state={state}
      css={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        width: '100%',
        gap: '1rem',
      }}
      onSubmit={handleSubmit}
    >
      <div
        css={{
          display: 'flex',
          flex: 1,
          borderRadius: '0.25rem',
          boxShadow: 'inset 0 0 0 1px #415062',
          backgroundColor: '#0b121a',
          ...(state === 'loading' && {
            boxShadow: `inset 0 0 0 1px #415062, 0 0 0 1px #0b121a, 0 0 0 3px #415062a1`,
          }),
          '@media screen and (min-width: 60rem)': {
            minWidth: '32rem',
          },
        }}
      >
        <input
          type="email"
          name="email"
          id="email"
          aria-label="Email address"
          placeholder="Enter your email address"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          css={{
            fontSize: 'var(--font-size-body-1)',
            flex: 1,
            minHeight: '3rem',
            padding: '0 1rem',
            border: 'none',
            borderRadius: '0.25rem',
            backgroundColor: 'transparent',
            color: 'white',
            overflow: 'hidden',
            '::placeholder': {
              color: '#415062',
            },
            ':focus': {
              outline: 'none',
            },
          }}
        />
        <button
          type="submit"
          disabled={state === 'loading'}
          css={{
            fontSize: 'var(--font-size-body-2)',
            fontWeight: 600,
            letterSpacing: '0.02em',
            display: 'flex',
            alignItems: 'center',
            padding: '0.5rem 1rem',
            margin: '0.5rem',
            gap: '0.5rem',
            border: 'none',
            borderRadius: '0.15rem',
            backgroundColor: '#304554',
            color: '#cdedff',
            cursor: 'pointer',
            ...(state === 'loading' && {
              animation: 'pulseOpacity 2s ease-in-out infinite',
            }),
          }}
        >
          <span>Subscribe</span>
          <svg
            width="15"
            height="15"
            viewBox="0 0 15 15"
            fill="none"
            css={{
              display: 'none',
              '@media screen and (min-width: 60rem)': {
                display: 'block',
                position: 'relative',
                top: '-0.1rem',
              },
            }}
          >
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M9.59388 3.22373L9.0596 2.68945L7.99104 3.75801L8.52532 4.2923L12.5245 8.29154H1.75559H1V9.80271H1.75559H12.5245L8.52532 13.802L7.99104 14.3362L9.0596 15.4048L9.59388 14.8705L14.7049 9.75949C15.0984 9.36606 15.0984 8.72818 14.7049 8.33475L9.59388 3.22373Z"
              fill="#CDEDFF"
            />
          </svg>
        </button>
      </div>
      {message ? (
        <div
          css={{
            fontSize: 'var(--font-size-body-3)',
            position: 'absolute',
            bottom: 0,
            translate: '0 120%',
            color: 'var(--color-foreground-secondary)',
            ...(state === 'success' && {
              color: '#c5e478',
            }),
            ...(state === 'error' && {
              color: '#f76d6d',
            }),
          }}
        >
          {message}
        </div>
      ) : null}
    </form>
  )
}
