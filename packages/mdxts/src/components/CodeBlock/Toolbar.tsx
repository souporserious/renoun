import React from 'react'
import { getTheme } from '../../index'
import { getContext } from '../../utils/context'
import { CopyButton } from '../CopyButton'
import { Context } from './Context'

type ToolbarProps = {
  /** The value of the code block. */
  value?: string

  /** The path to the source file on disk in development and the git provider source in production. */
  sourcePath?: string

  /** Whether or not to allow copying the code block. */
  allowCopy?: boolean

  /** Class name to apply to the toolbar. */
  className?: string

  /** Style to apply to the toolbar. */
  style?: React.CSSProperties

  /** The children of the toolbar. */
  children?: React.ReactNode
}

/** A toolbar for code blocks that displays the filename and a copy button. */
export function Toolbar({
  value: valueProp,
  sourcePath: sourcePathProp,
  allowCopy,
  className,
  style,
  children,
}: ToolbarProps) {
  const context = getContext(Context)
  const theme = getTheme()
  const value = valueProp ?? context?.value
  const sourcePath = sourcePathProp ?? context?.sourcePath

  return (
    <div
      className={className}
      style={{
        fontSize: '0.8em',
        display: 'flex',
        alignItems: 'center',
        boxShadow: `inset 0 -1px 0 0 ${theme.panel.border}70`,
        ...style,
      }}
    >
      {children || context?.filenameLabel}
      {sourcePath ? (
        <a
          href={sourcePath}
          target={process.env.NODE_ENV === 'development' ? undefined : '_blank'}
          rel="noopener noreferrer"
          title={`Open source file in ${
            process.env.NODE_ENV === 'development' ? `VS Code` : `GitHub`
          }`}
          style={{ display: 'flex', marginLeft: 'auto' }}
        >
          <svg viewBox="0 0 24 24" fill="none" width="1em" height="1em">
            <path
              d="M18 8L22.5011 11.1556C23.1663 11.622 23.1663 12.378 22.5011 12.8444L18 16"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <path
              d="M7 8L1.59865 11.1556C0.800449 11.622 0.800449 12.378 1.59865 12.8444L7 16"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <path
              d="M10 19L15 5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <path
              d="M10 19L15 5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </a>
      ) : null}
      {allowCopy && value ? (
        <CopyButton
          value={value}
          style={{ marginLeft: sourcePath ? '0.5em' : 'auto' }}
        />
      ) : null}
    </div>
  )
}
