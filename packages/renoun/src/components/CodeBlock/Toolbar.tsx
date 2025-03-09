import React from 'react'
import { styled, type CSSObject } from 'restyle'

import { getThemeColors } from '../../utils/get-theme.js'
import { getContext } from '../../utils/context.js'
import { CopyButton } from './CopyButton.js'
import { Context } from './Context.js'

export interface ToolbarProps {
  /** The value of the code block. */
  value?: string

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

async function ToolbarAsync({
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
          value={typeof allowCopy === 'string' ? allowCopy : value}
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

/** A toolbar for the `CodeBlock` component that displays the filename, a source link, and copy button. */
export function Toolbar(props: ToolbarProps) {
  return <ToolbarAsync {...props} />
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
