'use client'
import * as React from 'react'

export type BoxProps<Element extends React.ElementType> = {
  as?: React.ComponentPropsWithRef<Element>['ref']
  children?: React.ReactNode
  padding?: number | string
  backgroundColor?: string
  color?: string
  style?: React.CSSProperties
} & React.HTMLAttributes<HTMLElement>

export const Box = React.forwardRef(function Box<
  Element extends React.ElementType = 'div',
>(
  {
    as: Element = 'div',
    padding,
    backgroundColor,
    color,
    children,
    style,
    ...props
  }: BoxProps<Element>,
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
