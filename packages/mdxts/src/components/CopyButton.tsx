'use client'
import * as React from 'react'

export function CopyButton({ value }: { value: string }) {
  const [state, setState] = React.useState<'idle' | 'not-allowed' | 'copied'>(
    'idle'
  )
  return (
    <button
      title="Copy code to clipboard"
      onClick={() => {
        navigator.clipboard
          .writeText(value)
          .then(() => {
            setState('copied')
          })
          .catch(() => {
            setState('not-allowed')
          })
          .finally(() => {
            setTimeout(() => setState('idle'), 1000)
          })
      }}
      style={{
        display: 'flex',
        backgroundColor: 'transparent',
        padding: '0.35rem',
        border: 0,
        cursor: 'pointer',
      }}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{
          width: 'var(--font-size-body-3)',
          height: 'var(--font-size-body-3)',
        }}
      >
        <path
          d="M7.23913 16L4.56402 16C3.70023 16 3 15.2998 3 14.436V4.56402C3 3.70023 3.70023 3 4.56402 3L14.436 3C15.2998 3 16 3.70023 16 4.56402V7.52174"
          stroke="var(--color-foreground-interactive)"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M8 9.56402V19.436C8 20.2998 8.70023 21 9.56402 21L19.436 21C20.2998 21 21 20.2998 21 19.436V9.56402C21 8.70023 20.2998 8 19.436 8H9.56402C8.70023 8 8 8.70023 8 9.56402Z"
          stroke="var(--color-foreground-interactive)"
          strokeWidth="2"
          strokeLinecap="round"
        />
        {state === 'not-allowed' ? (
          <>
            <ellipse
              cx="14.2718"
              cy="14.2718"
              rx="3.90612"
              ry="3.90612"
              fill="#D15252"
            />
            <rect
              x="12.04"
              y="13.7134"
              width="4.46414"
              height="1.11603"
              rx="0.558017"
              fill="white"
            />
          </>
        ) : null}
        {state === 'copied' ? (
          <path
            d="M11.7754 14.1599L13.0231 15.6046C13.1335 15.7324 13.3255 15.7495 13.4567 15.6432L17.3556 12.4858"
            stroke="#3FC47C"
            strokeWidth="2"
            strokeLinecap="round"
          />
        ) : null}
      </svg>
    </button>
  )
}
