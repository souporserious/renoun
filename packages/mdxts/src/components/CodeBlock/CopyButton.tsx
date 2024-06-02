'use client'
import React, { useContext, useState } from 'react'

import { PreActiveContext } from './Pre'

/**
 * Copies a value to the user's clipboard.
 * @internal
 */
export function CopyButton({
  value,
  style,
  ...props
}: {
  value: string
} & React.ComponentProps<'button'>) {
  const preActive = useContext(PreActiveContext)
  const [state, setState] = useState<'idle' | 'not-allowed' | 'copied'>('idle')

  if (state === 'idle' && preActive === false) {
    return null
  }

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
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '1lh',
        height: '1lh',
        fontSize: 'inherit',
        lineHeight: 'inherit',
        padding: 0,
        border: 0,
        backgroundColor: 'transparent',
        cursor: 'pointer',
        ...style,
      }}
      {...props}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        width="1em"
        height="1em"
        style={{ color: 'inherit' }}
      >
        {state === 'idle' || state === 'not-allowed' ? (
          <path
            d="M8 9.56402V19.436C8 20.2998 8.70023 21 9.56402 21L19.436 21C20.2998 21 21 20.2998 21 19.436V9.56402C21 8.70023 20.2998 8 19.436 8H9.56402C8.70023 8 8 8.70023 8 9.56402Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        ) : null}
        {state === 'idle' ? (
          <path
            d="M7.23913 16L4.56402 16C3.70023 16 3 15.2998 3 14.436V4.56402C3 3.70023 3.70023 3 4.56402 3L14.436 3C15.2998 3 16 3.70023 16 4.56402V7.52174"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        ) : null}
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
            d="M5 12.2001L8.41362 16.1526C8.53012 16.2874 8.73562 16.2979 8.86517 16.1755L19 6.6001"
            stroke="#3FC47C"
            strokeWidth="2"
            strokeLinecap="round"
          />
        ) : null}
      </svg>
    </button>
  )
}
