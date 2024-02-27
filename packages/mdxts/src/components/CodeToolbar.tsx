'use client'
import React from 'react'
import { CopyButton } from './CopyButton'
import type { Theme } from './highlighter'

type BaseCodeToolbarProps = {
  /** The value of the code block. */
  value: string

  /** The path to the source file on disk in development and the git provider source in production. */
  sourcePath?: string

  /** The theme to use for highlighting. */
  theme: Theme
}

type CodeToolbarProps =
  | (BaseCodeToolbarProps & {
      /** The children of the toolbar. */
      children?: React.ReactNode
    })
  | (BaseCodeToolbarProps & {
      /** The filename of the code block. */
      filename?: string
    })

/** A toolbar for code blocks that displays the filename and a copy button. */
export function CodeToolbar({
  value,
  sourcePath,
  theme,
  ...props
}: CodeToolbarProps) {
  return (
    <div
      style={{
        gridRow: '1',
        gridColumn: '1 / -1',
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        alignItems: 'center',
        height: '3rem',
        boxShadow: `inset 0 -1px 0 0 ${theme.colors['panel.border']}70`,
      }}
    >
      {'filename' in props ? (
        <div
          style={{
            fontSize: 'var(--font-size-body-3)',
            padding: '0.5rem 1rem',
          }}
        >
          {props.filename}
        </div>
      ) : 'children' in props ? (
        props.children
      ) : null}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '0 0.5rem',
          marginLeft: 'auto',
        }}
      >
        {sourcePath ? (
          <a
            href={sourcePath}
            target="_blank"
            rel="noopener noreferrer"
            title={`Open source file in ${
              process.env.NODE_ENV === 'development' ? `VS Code` : `GitHub`
            }`}
            style={{ display: 'flex', padding: '0.35rem' }}
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
                d="M18 8L22.5011 11.1556C23.1663 11.622 23.1663 12.378 22.5011 12.8444L18 16"
                stroke="var(--color-foreground-interactive)"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <path
                d="M7 8L1.59865 11.1556C0.800449 11.622 0.800449 12.378 1.59865 12.8444L7 16"
                stroke="var(--color-foreground-interactive)"
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
                stroke="var(--color-foreground-interactive)"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </a>
        ) : null}
        <CopyButton value={value} />
      </div>
    </div>
  )
}
