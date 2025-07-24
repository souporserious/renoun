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

export function Trigger({
  children,
  css,
  ...props
}: { css?: CSSObject } & React.ComponentPropsWithoutRef<'button'>) {
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

export function Content<As extends React.ElementType = 'div'>({
  as,
  display = 'block',
  children,
  css,
  ...props
}: {
  as?: As
  display?: 'block' | 'flex' | 'grid' | 'list-item'
  css?: CSSObject
} & React.HTMLAttributes<HTMLDivElement>) {
  const Component = as || 'div'
  const { isOpen, triggerId, contentId } = useCollapse()

  return (
    <Component
      id={contentId}
      aria-labelledby={triggerId}
      hidden={!isOpen}
      className="CollapseContent"
      css={{ display, ...css }}
      {...props}
    >
      {children}
      <style href="CollapseContent" precedence="CollapseContent">{`
      .CollapseContent {
        width: 100%;
        height: auto;
        min-height: 0;
        opacity: 1;
        interpolate-size: allow-keywords;

        &[hidden] {
          height: 0;
          opacity: 0;
          overflow: hidden;
        }
      }

      @media (prefers-reduced-motion: no-preference) {
        .CollapseContent {
          transition:
            display 400ms allow-discrete,
            height 400ms,
            opacity 400ms;

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
