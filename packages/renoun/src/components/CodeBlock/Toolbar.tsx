import React from 'react'
import { styled, type CSSObject } from 'restyle'

import { getThemeColors } from '../../utils/get-theme.js'
import { getResolvedContext } from './Context.js'
import { CopyButton } from './CopyButton.js'

export interface ToolbarProps {
  /** Whether or not to allow copying the code block value. Accepts a boolean or a string that will be copied. */
  allowCopy?: boolean | string

  /** CSS object to apply to the toolbar. */
  css?: CSSObject

  /** Class name to apply to the toolbar. */
  className?: string

  /** Style to apply to the toolbar. */
  style?: React.CSSProperties

  /** The children of the toolbar rendered at the start. */
  children?: React.ReactNode
}

/** A toolbar for the `CodeBlock` component that displays the file path, a source link, and copy button. */
export async function Toolbar({
  allowCopy,
  css,
  className,
  style,
  children,
}: ToolbarProps) {
  const context = await getResolvedContext()
  const theme = await getThemeColors()
  let childrenToRender = children

  if (childrenToRender === undefined) {
    childrenToRender = <Label>{context.label}</Label>
  }

  return (
    <Container
      css={{ boxShadow: `inset 0 -1px 0 0 ${theme.panel.border}`, ...css }}
      className={className}
      style={style}
    >
      {childrenToRender}

      {allowCopy ? (
        <CopyButton
          value={typeof allowCopy === 'string' ? allowCopy : context.value}
          css={{
            padding: 0,
            marginLeft: 'auto',
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
