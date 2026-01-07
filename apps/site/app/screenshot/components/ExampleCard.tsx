'use client'

import type React from 'react'
import { useState, useRef } from 'react'

import {
  Transform3DExample,
  TextGradientExample,
  GlassmorphismExample,
  ClipPathExample,
  AnimationExample,
  ShadowExample,
  BlendModeExample,
  FilterExample,
  NeonGlowExample,
  FormExample,
} from './CSSExamples'

const componentMap: Record<string, React.ComponentType> = {
  Transform3DExample,
  TextGradientExample,
  GlassmorphismExample,
  ClipPathExample,
  AnimationExample,
  ShadowExample,
  BlendModeExample,
  FilterExample,
  NeonGlowExample,
  FormExample,
}

interface ExampleCardProps {
  title: string
  description: string
  componentId: string
  onCapture?: (element: HTMLElement) => void
}

export function ExampleCard({
  title,
  description,
  componentId,
  onCapture,
}: ExampleCardProps) {
  const Component = componentMap[componentId]
  const [isHovered, setIsHovered] = useState(false)
  const [isCapturing, setIsCapturing] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)

  const handlePointerUp = async (e: React.PointerEvent) => {
    // Don't capture if clicking on interactive elements (buttons, inputs, etc.)
    const target = e.target as HTMLElement
    const interactiveSelectors =
      'button, input, select, textarea, a, [role="button"], [tabindex]'
    if (target.closest(interactiveSelectors)) {
      return
    }

    if (contentRef.current && onCapture) {
      setIsCapturing(true)
      try {
        await onCapture(contentRef.current)
      } finally {
        setIsCapturing(false)
      }
    }
  }

  return (
    <div
      css={{
        overflow: 'hidden',
        transition: 'background-color 300ms ease',
        backgroundColor: isHovered
          ? 'rgba(255, 255, 255, 0.04)'
          : 'transparent',
        cursor: onCapture ? 'inherit' : 'default',
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onPointerUp={onCapture ? handlePointerUp : undefined}
    >
      <div
        css={{
          padding: '1rem 1.5rem',
          borderBottom: '1px solid',
          borderColor: isHovered
            ? 'rgba(255, 255, 255, 0.1)'
            : 'rgba(255, 255, 255, 0.05)',
          backgroundColor: isHovered
            ? 'rgba(255, 255, 255, 0.02)'
            : 'transparent',
          transition: 'background-color 300ms ease, border-color 300ms ease',
        }}
      >
        <h3
          css={{
            fontWeight: 'var(--font-weight-strong)',
            color: 'var(--color-foreground)',
            fontSize: 'var(--font-size-body-1)',
            marginBottom: '0.25rem',
          }}
        >
          {title}
        </h3>
        <p
          css={{
            fontSize: 'var(--font-size-body-2)',
            color: 'var(--color-foreground-interactive)',
          }}
        >
          {description}
        </p>
      </div>
      <div
        css={{
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          aria-hidden
          css={{
            position: 'absolute',
            inset: 0,
            backgroundColor: 'rgba(30, 35, 45, 0.2)',
            opacity: isHovered ? 1 : 0,
            transition: 'opacity 300ms ease',
            pointerEvents: 'none',
          }}
        />
        <div
          ref={contentRef}
          css={{
            padding: '2rem',
            minHeight: '320px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            overflow: 'hidden',
            isolation: 'isolate',
            zIndex: 1,
          }}
        >
          {Component && <Component />}
        </div>
        {isCapturing && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundColor: 'rgba(255, 255, 255, 0.15)',
              animation: 'example-card-flash 250ms ease-out forwards',
              pointerEvents: 'none',
              zIndex: 50,
            }}
          />
        )}
        <style>{`
          @keyframes example-card-flash {
            0% { opacity: 1; }
            100% { opacity: 0; }
          }
        `}</style>
      </div>
    </div>
  )
}
