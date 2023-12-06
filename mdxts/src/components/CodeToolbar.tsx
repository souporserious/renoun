'use client'
import React from 'react'

/** A toolbar for code blocks that displays the filename and a copy button. */
export function CodeToolbar({
  filename,
  value,
}: {
  /** The filename of the code block. */
  filename?: string

  /** The value of the code block. */
  value: string
}) {
  return (
    <div
      style={{
        gridRow: '1',
        gridColumn: '1 / -1',
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        alignItems: 'center',
        height: '40px',
        borderBottom: '1px solid #293742',
      }}
    >
      {filename ? (
        <div
          style={{
            fontSize: '0.8rem',
            padding: '0.8rem 1rem',
          }}
        >
          {filename.replace('mdxts/', '')}
        </div>
      ) : null}
      <button
        onClick={() => {
          navigator.clipboard.writeText(value)
        }}
        style={{
          backgroundColor: 'transparent',
          padding: '0.8rem',
          border: 0,
        }}
      >
        <svg
          aria-hidden="true"
          focusable="false"
          role="img"
          viewBox="0 0 16 16"
          width="12"
          height="12"
          fill="white"
        >
          <path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z"></path>
          <path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"></path>
        </svg>
      </button>
    </div>
  )
}
