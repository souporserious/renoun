'use client'
import type { ReactNode } from 'react'
import { createContext, useContext } from 'react'
import styled from 'styled-components'
import { textStyles } from '../../theme'

type DropDollarPrefix<T> = {
  [K in keyof T as K extends `$${infer I}` ? I : K]: T[K]
}

export type TextVariants = keyof typeof textStyles

type StyledTextProps = {
  $variant?: TextVariants
  $alignment?: 'start' | 'center' | 'end'
  $width?: string | number
  $weight?: number
  $lineHeight?: string
}

export type TextProps = {
  className?: string
  children: ReactNode
} & DropDollarPrefix<StyledTextProps>

const elements = {
  heading1: 'h1',
  heading2: 'h2',
  heading3: 'h3',
  body1: 'p',
  body2: 'p',
  mark: 'mark',
} as const

const TextAncestorContext = createContext(false)

export const Text = ({
  variant = 'body1',
  alignment,
  width,
  weight = 400,
  lineHeight,
  children,
}: TextProps) => {
  const hasTextAncestor = useContext(TextAncestorContext)
  const propElement = elements[variant]
  let asProp: any = 'p'

  if (hasTextAncestor) {
    asProp = 'span'
  }

  if (propElement) {
    asProp = propElement
  }

  return (
    <TextAncestorContext.Provider value={true}>
      <StyledText
        as={asProp}
        $alignment={alignment}
        $lineHeight={lineHeight}
        $width={width}
        $weight={weight}
        $variant={variant}
      >
        {children}
      </StyledText>
    </TextAncestorContext.Provider>
  )
}

const StyledText = styled.span<StyledTextProps>(
  ({ $alignment, $lineHeight, $weight, $width, $variant }) => {
    const styles = {
      margin: 0,
      textAlign: $alignment,
      width: $width,
      ...($variant ? textStyles[$variant] ?? {} : {}),
    } as any

    if ($weight !== undefined) {
      styles.fontWeight = $weight
    }

    if ($lineHeight !== undefined) {
      styles.lineHeight = $lineHeight
    }

    return styles
  }
)
