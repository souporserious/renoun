import React from 'react'

export type SlotComponentOrProps<TProps> =
  | React.ComponentType<TProps>
  | Omit<Partial<TProps>, 'children'>

export function isComponentOverride(
  value: unknown
): value is React.ComponentType<any> {
  return (
    typeof value === 'function' ||
    (typeof value === 'object' && value !== null && '$$typeof' in value)
  )
}

type MergeableProps = {
  className?: string
  style?: React.CSSProperties
  css?: unknown
}

export function createPropsOverrideComponent<TProps extends MergeableProps>(
  DefaultComponent: React.ComponentType<TProps>,
  overrideProps: Omit<Partial<TProps>, 'children'>
): React.ComponentType<TProps> {
  function Wrapped(props: TProps) {
    const merged: any = { ...props, ...overrideProps }

    const mergedClassName = [props.className, (overrideProps as any).className]
      .filter(Boolean)
      .join(' ')
    merged.className = mergedClassName || undefined

    if (props.style || (overrideProps as any).style) {
      merged.style = {
        ...(props.style ?? {}),
        ...(((overrideProps as any).style ?? {}) as object),
      }
    }

    const propsCss = (props as any).css
    const overrideCss = (overrideProps as any).css
    if (propsCss || overrideCss) {
      merged.css = { ...(propsCss ?? {}), ...(overrideCss ?? {}) }
    }

    return React.createElement(DefaultComponent as any, merged)
  }

  Wrapped.displayName =
    (DefaultComponent as any).displayName ||
    DefaultComponent.name ||
    'PropsOverrideComponent'

  return Wrapped
}

export function normalizeSlotComponents<
  Components extends { [Key in keyof Components]: React.ComponentType<any> },
>(
  defaultComponents: Components,
  overrides:
    | Partial<{ [Key in keyof Components]: SlotComponentOrProps<any> }>
    | undefined
): Components {
  if (!overrides) return defaultComponents

  const resolved = { ...defaultComponents } as Record<
    keyof Components,
    React.ComponentType<any>
  >

  for (const key of Object.keys(overrides) as Array<keyof Components>) {
    const override = overrides[key]
    if (!override) continue

    if (isComponentOverride(override)) {
      resolved[key] = override
      continue
    }

    resolved[key] = createPropsOverrideComponent(
      resolved[key] as any,
      override as any
    )
  }

  return resolved as unknown as Components
}
