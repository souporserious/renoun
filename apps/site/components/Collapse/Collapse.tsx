/** @jsxImportSource restyle */
'use client'
import React, { createContext, use, useId, useState } from 'react'
import type { CSSObject } from 'restyle'

const CollapseContext = createContext<
  | {
      triggerId: string
      contentId: string
      isOpen: boolean
      toggle: () => void
    }
  | undefined
>(undefined)

function useCollapse() {
  const context = use(CollapseContext)
  if (!context) {
    throw new Error('useCollapse must be used within a CollapseProvider')
  }
  return context
}

export function Provider({
  defaultOpen = false,
  children,
}: {
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const triggerId = useId()
  const contentId = useId()
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <CollapseContext
      value={{
        triggerId,
        contentId,
        isOpen,
        toggle: () => setIsOpen((currentIsOpen) => !currentIsOpen),
      }}
    >
      {children}
    </CollapseContext>
  )
}

interface CollapseVariants {
  initial: React.ReactNode
  open: React.ReactNode
}

export function Trigger({
  children,
  css,
  ...props
}: {
  children: CollapseVariants | React.ReactNode
  css?: CSSObject
} & Omit<React.ComponentPropsWithoutRef<'button'>, 'children'>) {
  const { triggerId, contentId, isOpen, toggle } = useCollapse()
  let childrenToRender = children

  if (childrenToRender === undefined) {
    childrenToRender = <TriggerIcon />
  }

  return (
    <button
      id={triggerId}
      aria-expanded={isOpen}
      aria-controls={contentId}
      onClick={toggle}
      css={{
        width: childrenToRender === undefined ? 16 : undefined,
        height: childrenToRender === undefined ? 16 : undefined,
        padding: 0,
        border: 0,
        background: 'none',
        ...css,
      }}
      {...props}
    >
      {typeof childrenToRender === 'object'
        ? (childrenToRender as CollapseVariants)[isOpen ? 'open' : 'initial']
        : childrenToRender}
    </button>
  )
}

export function TriggerIcon({ css }: { css?: CSSObject }) {
  return (
    <svg
      viewBox="0 0 12 12"
      css={{
        width: '100%',
        height: '100%',
        transition: 'transform 200ms ease',

        '[aria-expanded="true"] &': {
          transform: 'rotate(90deg)',
        },
        ...css,
      }}
    >
      <path d="M3 2l4 4-4 4" fill="none" stroke="currentColor" />
    </svg>
  )
}

type CSSUnits = 'px' | 'rem' | 'em' | '%' | 'vh' | 'vw'

type CSSLength = number | 'auto' | `${number}${CSSUnits}`

interface CollapseHeightVariants {
  /** Height when initially closed. Defaults to `0`. */
  initial?: CSSLength

  /** Height when opened. Defaults to 'auto'. */
  open?: CSSLength
}

type CollapseHeightProp = CSSLength | CollapseHeightVariants

/** Normalizes a length to a CSS string (numbers → px). */
function toCssSize(value: CSSLength | undefined): CSSLength | undefined {
  if (value === undefined) {
    return undefined
  }
  if (typeof value === 'number') {
    return `${value}px`
  }
  return value
}

/** True if the provided size is any form of zero (0, '0', '0px', '0%'). */
function isZeroSize(value: CSSLength | undefined): boolean {
  if (value === undefined) {
    return true
  }
  if (typeof value === 'number') {
    return value === 0
  }
  return /^\s*0(?:[a-z%]*)?\s*$/i.test(value)
}

export function Content<As extends React.ElementType = 'div'>({
  as,
  display = 'block',
  height,
  children,
  css,
  ...props
}: {
  /** The component or element to render the content as. */
  as?: As

  /** Display style of the content. */
  display?: 'block' | 'flex' | 'grid' | 'list-item'

  /** Control closed/opened heights. */
  height?: CollapseHeightProp

  /** CSS styles to apply to the content. */
  css?: CSSObject
} & React.HTMLAttributes<HTMLDivElement>) {
  const Component = as || 'div'
  const { isOpen, triggerId, contentId } = useCollapse()
  let initialHeight: CSSLength | undefined = undefined
  let openedHeight: CSSLength | undefined = undefined

  if (typeof height === 'number' || typeof height === 'string') {
    initialHeight = toCssSize(height)
    openedHeight = 'auto'
  } else if (height && typeof height === 'object') {
    initialHeight = toCssSize(height.initial ?? 0)
    openedHeight = toCssSize(height.open ?? 'auto')
  } else {
    initialHeight = '0px'
    openedHeight = 'auto'
  }

  const initialIsZero = isZeroSize(initialHeight)
  const vars: CSSObject = {
    // @ts-expect-error
    ['--collapse-height']: isOpen ? openedHeight : initialHeight,
    ['--collapse-overflow']: isOpen ? 'visible' : 'hidden',
  }

  return (
    <Component
      id={contentId}
      aria-labelledby={triggerId}
      hidden={initialIsZero ? !isOpen : undefined}
      data-state={isOpen ? 'open' : 'closed'}
      data-starting-style={initialIsZero ? 'true' : undefined}
      className="CollapseContent"
      css={{
        display,
        height: 'var(--collapse-height)',
        overflow: 'var(--collapse-overflow)',
        ...vars,
        ...css,
      }}
      {...props}
    >
      {children}
      <style href="CollapseContent" precedence="CollapseContent">{`
      .CollapseContent {
        width: 100%;
        min-height: 0;
        opacity: 1;
        interpolate-size: allow-keywords;
        overflow: hidden;
      }

      /* Classic closed state driven by the hidden attribute when initial is 0. */
      .CollapseContent[hidden] {
        height: 0;
        opacity: 0;
      }

      /* When not using [hidden], we still want overflow clipped while closed. */
      .CollapseContent[data-state="closed"]:not([hidden]) {
        overflow: hidden;
      }

      @media (prefers-reduced-motion: no-preference) {
        .CollapseContent {
          transition:
            display 400ms allow-discrete,
            height 400ms,
            opacity 400ms;
        }

        /* Apply starting-style when initial is 0. */
        .CollapseContent[data-starting-style="true"] {
          @starting-style {
            height: 0;
            opacity: 0;
          }
        }
      }
      `}</style>
    </Component>
  )
}
