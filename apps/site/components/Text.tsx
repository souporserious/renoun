'use client'
import type { ReactNode } from 'react'
import { createContext, useContext } from 'react'
import { styled } from 'restyle'
import type { CSSObject } from 'restyle'

const textVariants = {
  'heading-1': {
    fontSize: 'var(--font-size-heading-1)',
    fontWeight: 'var(--font-weight-heading)',
    lineHeight: 'var(--line-height-heading-1)',
    letterSpacing: 'normal',
    textWrap: 'balance',
    '::before': {
      marginBottom: '-0.08em',
    },
    '::after': {
      marginTop: '-0.0825em',
    },
  },
  'heading-2': {
    fontSize: 'var(--font-size-heading-2)',
    fontWeight: 'var(--font-weight-heading)',
    lineHeight: 'var(--line-height-heading-2)',
    letterSpacing: 'normal',
    textWrap: 'balance',
    '::before': {
      marginTop: '-0.3em',
    },
    '::after': {
      marginTop: '-0.3em',
    },
  },
  'heading-3': {
    fontSize: 'var(--font-size-heading-3)',
    fontWeight: 'var(--font-weight-heading)',
    lineHeight: 'var(--line-height-heading-3)',
    letterSpacing: 'normal',
    textWrap: 'balance',
    '::before': {
      marginBottom: '-0.25em',
    },
    '::after': {
      marginTop: '-0.29em',
    },
  },
  'body-1': {
    fontSize: 'var(--font-size-body-1)',
    fontWeight: 'var(--font-weight-body)',
    lineHeight: 'var(--line-height-body-1)',
    letterSpacing: 'normal',
    textWrap: 'pretty',
  },
}

export type TextVariants = keyof typeof textVariants

export type TextProps = {
  variant?: TextVariants
  css?: CSSObject
  children: ReactNode
}

const elements = {
  'heading-1': 'h1',
  'heading-2': 'h2',
  'heading-3': 'h3',
  'body-1': 'p',
  'body-2': 'p',
  mark: 'mark',
} as const

const TextAncestorContext = createContext(false)

export function Text({ css, variant = 'body-1', children }: TextProps) {
  const hasTextAncestor = useContext(TextAncestorContext)
  const propElement = elements[variant]
  let asProp: any = 'p'

  if (hasTextAncestor) {
    asProp = 'span'
  }

  if (propElement) {
    asProp = propElement
  }

  const StyledText = styled(asProp, getStyles)

  return (
    <TextAncestorContext.Provider value={true}>
      <StyledText variant={variant} style={css}>
        {children}
      </StyledText>
    </TextAncestorContext.Provider>
  )
}

function getStyles({
  style,
  variant,
}: {
  style?: CSSObject
  variant: TextVariants
}) {
  const styles = {
    margin: 0,
    ...(textVariants[variant] ?? {}),
    ...style,
  } as CSSObject

  return styles
}
