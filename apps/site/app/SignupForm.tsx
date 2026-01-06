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
        setMessage('Please enter your email address.')
        setState('error')
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
        gap: '0.75rem',
        maxWidth: '34rem',
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
          transition: 'box-shadow 200ms ease',
          padding: '0.3rem',
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
          required
          value={email}
          onChange={(event) => {
            setEmail(event.target.value)
            if (message) setMessage(null)
          }}
          autoFocus={autoFocus}
          css={{
            fontSize: '0.95rem',
            flex: 1,
            minHeight: '3rem',
            padding: '0 1.1rem',
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
            padding: '0 1.1rem',
            margin: 0,
            border: 'none',
            borderRadius: '999px',
            backgroundColor: 'var(--color-surface-accent)',
            color: '#111',
            cursor: 'pointer',
            transition: 'background-color 0.2s',
            minWidth: '3rem',
            fontSize: '0.9rem',
            ':hover:not(:disabled)': {
              backgroundColor:
                'color-mix(in srgb, var(--color-surface-accent) 92%, var(--color-background))',
            },
            ':disabled': {
              cursor: 'not-allowed',
            },
          }}
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 18 18"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M6.46967 4.21967L7.53033 3.15899L12.8713 8.5L7.53033 13.841L6.46967 12.7803L10.25 8.99999H3.5V7.99999H10.25L6.46967 4.21967Z"
              fill="#0c0900"
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
