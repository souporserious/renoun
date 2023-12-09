'use client'
import React from 'react'

/** A toolbar for code blocks that displays the filename and a copy button. */
export function CodeToolbar({
  filename,
  value,
  sourcePath,
}: {
  /** The filename of the code block. */
  filename?: string

  /** The value of the code block. */
  value: string

  /** The path to the source file on disk in development and the git provider source in production. */
  sourcePath?: string
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
            padding: '0.5rem 1rem',
          }}
        >
          {filename.replace('mdxts/', '')}
        </div>
      ) : null}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '0 0.5rem',
          gap: '0.25rem',
        }}
      >
        {sourcePath ? (
          <a
            href={sourcePath}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: 'flex', padding: '0.25rem' }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M18 8L22.5011 11.1556C23.1663 11.622 23.1663 12.378 22.5011 12.8444L18 16"
                stroke="#7E7E7E"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <path
                d="M7 8L1.59865 11.1556C0.800449 11.622 0.800449 12.378 1.59865 12.8444L7 16"
                stroke="#7E7E7E"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <path
                d="M10 19L15 5"
                stroke="black"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <path
                d="M10 19L15 5"
                stroke="#7E7E7E"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </a>
        ) : null}
        <button
          onClick={() => {
            navigator.clipboard.writeText(value)
          }}
          style={{
            display: 'flex',
            backgroundColor: 'transparent',
            padding: '0.25rem',
            border: 0,
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M7.23913 16L4.56402 16C3.70023 16 3 15.2998 3 14.436V4.56402C3 3.70023 3.70023 3 4.56402 3L14.436 3C15.2998 3 16 3.70023 16 4.56402V7.52174"
              stroke="#7E7E7E"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <path
              d="M8 9.56402V19.436C8 20.2998 8.70023 21 9.56402 21L19.436 21C20.2998 21 21 20.2998 21 19.436V9.56402C21 8.70023 20.2998 8 19.436 8H9.56402C8.70023 8 8 8.70023 8 9.56402Z"
              stroke="#7E7E7E"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
    </div>
  )
}
