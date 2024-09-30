import React from 'react'
import { css, type CSSObject } from 'restyle'

type CalloutVariant = 'note' | 'tip' | 'important' | 'warning' | 'caution'

const defaultVariantStyles = {
  note: {
    backgroundColor: '#1e3a8a',
    borderLeftColor: '#3b82f6',
  },
  tip: {
    backgroundColor: '#065f46',
    borderLeftColor: '#10b981',
  },
  important: {
    backgroundColor: '#5e3b76',
    borderLeftColor: '#a371f7',
  },
  warning: {
    backgroundColor: '#92400e',
    borderLeftColor: '#f59e0b',
  },
  caution: {
    backgroundColor: '#7f1d1d',
    borderLeftColor: '#f87171',
  },
} satisfies Record<CalloutVariant, CSSObject>

const defaultVariantEmojis = {
  note: '📝',
  tip: '💡',
  important: '🔮',
  warning: '⚠️',
  caution: '🚨',
} satisfies Record<CalloutVariant, string>

interface CalloutProps {
  children: React.ReactNode
  variant?: CalloutVariant
  css?: CSSObject
}

interface BaseCalloutProps extends CalloutProps {
  variantStyles: Record<CalloutVariant, CSSObject>
  variantEmojis: Record<CalloutVariant, string>
}

function BaseCallout({
  children,
  variant = 'note',
  css: cssProp,
  variantStyles,
  variantEmojis,
}: BaseCalloutProps) {
  let Element: 'aside' | 'div' = 'div'

  if (variant === 'note' || variant === 'tip') {
    Element = 'aside'
  }

  const [classNames, Styles] = css({
    display: 'flex',
    padding: '1rem 1.5rem 1rem 1rem',
    gap: '1rem',
    borderLeftStyle: 'solid',
    borderLeftWidth: 5,
    borderRadius: 5,
    color: 'white',
    ...variantStyles[variant],
    ...cssProp,
  })

  return (
    <Element className={classNames}>
      <span>{variantEmojis[variant]}</span>
      {children}
      <Styles />
    </Element>
  )
}

export function Callout({
  children,
  variant = 'note',
  css: cssProp,
}: CalloutProps) {
  return (
    <BaseCallout
      children={children}
      variant={variant}
      css={cssProp}
      variantStyles={defaultVariantStyles}
      variantEmojis={defaultVariantEmojis}
    />
  )
}

Callout.variants = function (
  variants: Partial<
    Record<CalloutVariant, { icon?: string; style?: CSSObject }>
  >
) {
  const mergedVariantStyles = {
    ...defaultVariantStyles,
    ...Object.fromEntries(
      Object.entries(variants).map(([key, value]) => [
        key,
        { ...defaultVariantStyles[key as CalloutVariant], ...value.style },
      ])
    ),
  }

  const mergedVariantEmojis = {
    ...defaultVariantEmojis,
    ...Object.fromEntries(
      Object.entries(variants).map(([key, value]) => [
        key,
        value.icon || defaultVariantEmojis[key as CalloutVariant],
      ])
    ),
  }

  return function Callout({
    children,
    variant = 'note',
    css: cssProp,
  }: CalloutProps) {
    return (
      <BaseCallout
        children={children}
        variant={variant}
        css={cssProp}
        variantStyles={mergedVariantStyles}
        variantEmojis={mergedVariantEmojis}
      />
    )
  }
}
