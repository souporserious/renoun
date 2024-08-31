import React from 'react'
import { styled, type CSSObject } from 'restyle'

import { getThemeColors } from '../../utils/get-theme-colors'
import { getContext } from '../../utils/context'
import { CopyButton } from './CopyButton'
import { Context } from './Context'

export type ToolbarProps = {
  /** The value of the code block. */
  value?: string

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
  allowCopy,
  css,
  className,
  style,
  children,
}: ToolbarProps) {
  const context = getContext(Context)
  const theme = await getThemeColors()
  const value = valueProp ?? context?.value
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

      {allowCopy && value ? (
        <CopyButton
          value={value}
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
