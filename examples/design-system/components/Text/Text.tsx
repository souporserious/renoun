'use client'
import type { ReactNode } from 'react'
import { createContext, useContext } from 'react'
import { styled } from 'restyle'
import type { CSSObject } from 'restyle/dist/types'

const textStyles = {
  heading1: {
    fontSize: `var(--heading1)`,
    fontWeight: 700,
    lineHeight: '1',
  },
  heading2: {
    fontSize: `var(--heading2)`,
    fontWeight: 500,
    lineHeight: '1.25',
  },
  heading3: {
    fontSize: `var(--heading3)`,
    fontWeight: 500,
    lineHeight: '1.25',
  },
  body1: {
    fontSize: `var(--body1)`,
    fontWeight: 400,
    lineHeight: '1.5',
  },
  body2: {
    fontSize: `var(--body2)`,
    fontWeight: 400,
    lineHeight: '1.25',
  },
  mark: {
    background: 'linear-gradient(180deg, #E3BEFF, #A734FF)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  },
}

export type DropDollarPrefix<T> = {
  [K in keyof T as K extends `$${infer I}` ? I : K]: T[K]
}

export type TextVariants = keyof typeof textStyles

type StyledTextProps = {
  $variant?: TextVariants
  $alignment?: 'start' | 'center' | 'end'
  $width?: string | number
  $lineHeight?: string
  $color?: string
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
  lineHeight,
  color,
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
        // as={asProp}
        $alignment={alignment}
        $lineHeight={lineHeight}
        $width={width}
        $color={color}
        $variant={variant}
      >
        {children}
      </StyledText>
    </TextAncestorContext.Provider>
  )
}

const StyledText = styled(
  'span',
  ({
    $alignment,
    $lineHeight,
    $width,
    $color,
    $variant = 'body1',
  }: StyledTextProps) => {
    const styles = {
      margin: 0,
      textAlign: $alignment,
      width: $width,
      color: $color,
      ...(textStyles[$variant] ?? {}),
    } as CSSObject

    // allow overriding text style line height
    if ($lineHeight !== undefined) {
      styles.lineHeight = $lineHeight
    }

    return styles
  }
)
