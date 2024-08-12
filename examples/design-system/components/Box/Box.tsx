import * as React from 'react'

type BoxColors = 'red' | 'green' | 'blue'

export type BoxProps = {
  as?: React.ElementType
  children?: React.ReactNode
  padding?: number | string
  backgroundColor?: string
  color?: BoxColors
  style?: React.CSSProperties
} & React.HTMLAttributes<HTMLElement>

export const Box = React.forwardRef(function Box(
  {
    as: Element = 'div',
    padding,
    backgroundColor,
    color,
    children,
    style,
    ...props
  }: BoxProps,
  ref: React.Ref<HTMLElement>
) {
  return (
    <Element
      ref={ref}
      {...props}
      style={{
        ...style,
        padding,
        backgroundColor,
        color,
      }}
    >
      {children}
    </Element>
  )
})
