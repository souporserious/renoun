'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

type SignupFormProps = {
  autoFocus?: boolean
}

export function SignupForm({ autoFocus = false }: SignupFormProps = {}) {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [state, setState] = useState<'idle' | 'loading' | 'success' | 'error'>(
    'idle'
  )
  const timeoutId = useRef<ReturnType<typeof setTimeout> | null>(null)
  const router = useRouter()
  const clearTimeoutId = () => {
    if (timeoutId.current) {
      clearTimeout(timeoutId.current)
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    clearTimeoutId()

    try {
      const formData = new FormData(event.currentTarget)
      const trimmedEmail =
        (formData.get('email') as string | null)?.trim() ?? ''

      if (!trimmedEmail) {
        setState('idle')
        router.push('/docs/getting-started')
        return
      }

      formData.set('email', trimmedEmail)
      setState('loading')

      let response = await fetch(
        'https://souporserious.lemonsqueezy.com/email-subscribe/external',
        { method: 'POST', body: formData }
      )

      if (response.ok) {
        setMessage(
          `A confirmation email has been sent, please check your inbox. Redirecting to the getting started docs...`
        )
      } else {
        setMessage(`Sorry, your subscription could not be processed.`)
      }
      setState('success')
      setEmail('')
      timeoutId.current = setTimeout(() => {
        setMessage(null)
        setState('idle')
        router.push('/docs/getting-started')
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
        alignItems: 'stretch',
        width: '100%',
        gap: '1.5rem',
        maxWidth: '40rem',
      }}
      onSubmit={handleSubmit}
    >
      <div
        css={{
          display: 'flex',
          flex: 1,
          borderRadius: '999px',
          background: 'var(--color-surface-interactive)',
          boxShadow: 'inset 0 0 0 1px var(--color-separator)',
          transition: 'box-shadow 200ms ease, transform 200ms ease',
          padding: '0.4rem',
          ...(state === 'loading' && {
            boxShadow:
              'inset 0 0 0 1px rgba(247, 201, 72, 0.7), 0 0 0 6px rgba(247, 201, 72, 0.12)',
          }),
        }}
      >
        <input
          type="email"
          name="email"
          id="email"
          aria-label="Email address"
          placeholder="Enter your email address"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoFocus={autoFocus}
          css={{
            fontSize: '1.1rem',
            flex: 1,
            minHeight: '3.75rem',
            padding: '0 1.5rem',
            border: 'none',
            borderRadius: '999px',
            backgroundColor: 'transparent',
            color: '#f9fafc',
            '::placeholder': {
              color: 'var(--color-foreground-interactive)',
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
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 1.5rem',
            margin: 0,
            border: 'none',
            borderRadius: '999px',
            backgroundColor: 'var(--color-surface-accent)',
            color: '#111',
            cursor: 'pointer',
            transition: 'transform 150ms ease, box-shadow 200ms ease',
            minWidth: '3.5rem',
            ':hover': {
              transform: 'translateX(2px)',
              boxShadow: '0 12px 24px rgba(247, 201, 72, 0.25)',
            },
            ':disabled': {
              cursor: 'progress',
              transform: 'none',
              boxShadow: 'none',
            },
          }}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 15 15"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M9.59388 3.22373L9.0596 2.68945L7.99104 3.75801L8.52532 4.2923L12.5245 8.29154H1.75559H1V9.80271H1.75559H12.5245L8.52532 13.802L7.99104 14.3362L9.0596 15.4048L9.59388 14.8705L14.7049 9.75949C15.0984 9.36606 15.0984 8.72818 14.7049 8.33475L9.59388 3.22373Z"
              fill="#111"
            />
          </svg>
        </button>
      </div>
      {message ? (
        <div
          css={{
            fontSize: '1rem',
            color: 'var(--color-foreground-secondary)',
            textAlign: 'center',
            ...(state === 'success' && {
              color: '#d6ff8f',
            }),
            ...(state === 'error' && {
              color: '#ff9494',
            }),
          }}
        >
          {message}
        </div>
      ) : null}
    </form>
  )
}
