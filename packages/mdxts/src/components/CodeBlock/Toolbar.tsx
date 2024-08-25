import React from 'react'
import { styled, type CSSObject } from 'restyle'

import { getThemeColors } from '../../utils/get-theme-colors'
import { getContext } from '../../utils/context'
import { CopyButton } from './CopyButton'
import { Context } from './Context'

export type ToolbarProps = {
  /** The value of the code block. */
  value?: string

  /** The path to the source file. */
  sourcePath?: string

  /** Whether or not to allow copying the code block value. */
  allowCopy?: boolean

  /** CSS object to apply to the toolbar. */
  css?: CSSObject

  /** Class name to apply to the toolbar. */
  className?: string

  /** Style to apply to the toolbar. */
  style?: React.CSSProperties

  /** The children of the toolbar rendered at the start. */
  children?: React.ReactNode
}

/** A toolbar for the `CodeBlock` component that displays the filename, a source link, and copy button. */
export async function Toolbar({
  value: valueProp,
  sourcePath: sourcePathProp,
  allowCopy,
  css,
  className,
  style,
  children,
}: ToolbarProps) {
  const context = getContext(Context)
  const theme = await getThemeColors()
  const value = valueProp ?? context?.value
  const sourcePath = sourcePathProp ?? context?.sourcePath
  let childrenToRender = children

  if (childrenToRender === undefined && context) {
    childrenToRender = <Label>{context.filenameLabel}</Label>
  }

  return (
    <Container
      css={{ boxShadow: `inset 0 -1px 0 0 ${theme.panel.border}`, ...css }}
      className={className}
      style={style}
    >
      {childrenToRender}

      {sourcePath ? (
        <SourcePathLink
          href={sourcePath}
          target={process.env.NODE_ENV === 'development' ? undefined : '_blank'}
          rel="noopener noreferrer"
          title={`Open source file in ${
            process.env.NODE_ENV === 'development' ? `VS Code` : `GitHub`
          }`}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke={theme.activityBar.foreground}
            width="1em"
            height="1em"
          >
            <path
              d="M18 8L22.5011 11.1556C23.1663 11.622 23.1663 12.378 22.5011 12.8444L18 16"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <path
              d="M7 8L1.59865 11.1556C0.800449 11.622 0.800449 12.378 1.59865 12.8444L7 16"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <path d="M10 19L15 5" strokeWidth="2" strokeLinecap="round" />
            <path d="M10 19L15 5" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </SourcePathLink>
      ) : null}

      {allowCopy && value ? (
        <CopyButton
          value={value}
          css={{
            padding: 0,
            marginLeft: sourcePath ? undefined : 'auto',
            color: theme.activityBar.foreground,
          }}
        />
      ) : null}
    </Container>
  )
}

const Container = styled('div', {
  fontSize: 'inherit',
  display: 'flex',
  alignItems: 'center',
  gap: '0.25em',
})

const Label = styled('span', {
  fontSize: '0.8em',
})

const SourcePathLink = styled('a', {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '1lh',
  height: '1lh',
  fontSize: 'inherit',
  lineHeight: 'inherit',
  marginLeft: 'auto',
})
