/** @jsxImportSource restyle */
'use client'
import React, {
  createContext,
  use,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react'
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

  if (
    childrenToRender &&
    typeof childrenToRender === 'object' &&
    ('initial' in childrenToRender || 'open' in childrenToRender)
  ) {
    childrenToRender = (childrenToRender as CollapseVariants)[
      isOpen ? 'open' : 'initial'
    ]
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
      {childrenToRender}
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

/** Max-height variants mirror height API for consistency. */
interface CollapseMaxHeightVariants {
  /** Max-height when initially closed. */
  initial?: CSSLength

  /** Max-height when opened. */
  open?: CSSLength
}

type CollapseMaxHeightProp = CSSLength | CollapseMaxHeightVariants

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
  maxHeight,
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

  /** Control closed/opened max-heights. */
  maxHeight?: CollapseMaxHeightProp

  /** CSS styles to apply to the content. */
  css?: CSSObject
} & React.HTMLAttributes<HTMLDivElement>) {
  const Component = as || 'div'
  const { isOpen, triggerId, contentId } = useCollapse()
  const contentRef = useRef<HTMLDivElement | null>(null)
  const [isOverflowing, setIsOverflowing] = useState(false)
  let initialHeight: CSSLength | undefined = undefined
  let openedHeight: CSSLength | undefined = undefined
  let initialMaxHeight: CSSLength | undefined = undefined
  let openedMaxHeight: CSSLength | undefined = undefined

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

  if (typeof maxHeight === 'number' || typeof maxHeight === 'string') {
    initialMaxHeight = toCssSize(maxHeight)
    openedMaxHeight = toCssSize(maxHeight)
  } else if (maxHeight && typeof maxHeight === 'object') {
    initialMaxHeight = toCssSize(maxHeight.initial)
    openedMaxHeight = toCssSize(maxHeight.open)
  }

  const initialIsZero = isZeroSize(initialHeight)
  const currentMaxHeight = isOpen ? openedMaxHeight : initialMaxHeight
  const currentHeight: CSSLength | string | undefined = isOpen
    ? openedMaxHeight !== undefined && isOverflowing
      ? 'var(--collapse-max-height)'
      : openedHeight
    : initialHeight
  const vars: CSSObject = {
    // @ts-expect-error
    ['--collapse-height']: currentHeight,
    ['--collapse-overflow']: isOpen
      ? currentMaxHeight !== undefined
        ? 'auto'
        : 'visible'
      : 'hidden',
  }

  if (currentMaxHeight !== undefined) {
    vars['--collapse-max-height'] = currentMaxHeight
  }

  useEffect(() => {
    const element = contentRef.current
    if (!element) {
      return
    }
    if (!isOpen || openedMaxHeight === undefined) {
      setIsOverflowing(false)
      return
    }

    const update = () => {
      // If content height exceeds the element's current box (constrained by max-height), it's overflowing
      const overflowing = element.scrollHeight > element.clientHeight + 1
      setIsOverflowing(overflowing)
    }

    update()
    const ro = new ResizeObserver(update)
    ro.observe(element)
    window.addEventListener('resize', update)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [children, isOpen, openedMaxHeight])

  return (
    <Component
      ref={contentRef}
      id={contentId}
      aria-labelledby={triggerId}
      hidden={initialIsZero ? !isOpen : undefined}
      data-state={isOpen ? 'open' : 'closed'}
      data-starting-style={initialIsZero ? 'true' : undefined}
      className="CollapseContent"
      css={{
        display,
        height: 'var(--collapse-height)',
        ...(currentMaxHeight !== undefined
          ? { maxHeight: 'var(--collapse-max-height)' }
          : {}),
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
            max-height 400ms,
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
