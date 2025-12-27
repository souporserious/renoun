'use client'

import { useState } from 'react'
import { motion, useSpring, useTransform } from 'motion/react'

export function Transform3DExample() {
  const [isHovered, setIsHovered] = useState(false)

  // Spring-animated values for smooth motion
  const rotateXSpring = useSpring(0, { stiffness: 150, damping: 20 })
  const rotateYSpring = useSpring(0, { stiffness: 150, damping: 20 })

  // Transform springs to CSS rotate values
  const rotateX = useTransform(rotateXSpring, (v) => `${v}deg`)
  const rotateY = useTransform(rotateYSpring, (v) => `${v}deg`)

  return (
    <div
      css={{
        perspective: '800px',
        width: '100%',
        height: '100%',
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect()
        const x = (e.clientX - rect.left - rect.width / 2) / 8
        const y = -(e.clientY - rect.top - rect.height / 2) / 8
        rotateYSpring.set(x)
        rotateXSpring.set(y)
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false)
        rotateYSpring.set(0)
        rotateXSpring.set(0)
      }}
    >
      <motion.div
        style={{
          width: '12rem',
          height: '16rem',
          borderRadius: '0.75rem',
          background:
            'linear-gradient(to bottom right, #06b6d4, #3b82f6, #6366f1)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transformStyle: 'preserve-3d',
          rotateX,
          rotateY,
        }}
      >
        <div
          css={{
            color: 'white',
            fontWeight: 'var(--font-weight-heading)',
            fontSize: '1.25rem',
          }}
          style={{ transform: 'translateZ(40px)' }}
        >
          Hover Me
        </div>
        <div
          css={{
            position: 'absolute',
            inset: '1rem',
            border: '2px solid rgba(255, 255, 255, 0.3)',
            borderRadius: '0.5rem',
          }}
          style={{ transform: 'translateZ(20px)' }}
        />
      </motion.div>
    </div>
  )
}

export function TextGradientExample() {
  return (
    <div
      css={{
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.25rem',
      }}
    >
      <h2
        css={{
          fontSize: '3rem',
          fontWeight: 900,
          lineHeight: 1,
          background:
            'linear-gradient(135deg, #667eea 0%, #764ba2 25%, #f093fb 50%, #f5576c 75%, #fda085 100%)',
          backgroundClip: 'text',
          WebkitBackgroundClip: 'text',
          color: 'transparent',
          WebkitTextFillColor: 'transparent',
        }}
      >
        Stunning
      </h2>
      <h2
        css={{
          fontSize: '3rem',
          fontWeight: 900,
          lineHeight: 1,
          background: 'linear-gradient(90deg, #00d2ff, #3a7bd5, #00d2ff)',
          backgroundSize: '200% 100%',
          backgroundClip: 'text',
          WebkitBackgroundClip: 'text',
          color: 'transparent',
          animation: 'shimmer 2s linear infinite',
        }}
      >
        Gradients
      </h2>
      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  )
}

export function GlassmorphismExample() {
  return (
    <div css={{ position: 'relative', width: '100%', maxWidth: '20rem' }}>
      <div
        css={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(to right, #ec4899, #a855f7, #6366f1)',
          borderRadius: '1.5rem',
          filter: 'blur(1rem)',
          opacity: 0.6,
        }}
      />
      <div
        css={{
          position: 'absolute',
          top: '1rem',
          left: '2rem',
          width: '5rem',
          height: '5rem',
          backgroundColor: '#facc15',
          borderRadius: '50%',
          filter: 'blur(4px)',
          opacity: 0.8,
        }}
      />
      <div
        css={{
          position: 'absolute',
          bottom: '2rem',
          right: '1rem',
          width: '4rem',
          height: '4rem',
          backgroundColor: '#22d3ee',
          borderRadius: '50%',
          filter: 'blur(4px)',
          opacity: 0.8,
        }}
      />
      <div
        css={{
          position: 'relative',
          borderRadius: '1rem',
          padding: '1.5rem',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          background: 'rgba(255, 255, 255, 0.1)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
        }}
      >
        <h3
          css={{
            color: 'white',
            fontWeight: 'var(--font-weight-strong)',
            fontSize: '1.125rem',
            marginBottom: '0.5rem',
          }}
        >
          Glass Card
        </h3>
        <p css={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: '0.875rem' }}>
          Backdrop blur with transparency creates beautiful glassmorphism
          effects.
        </p>
      </div>
    </div>
  )
}

export function ClipPathExample() {
  const [hoveredShape, setHoveredShape] = useState<
    'diamond' | 'hexagon' | null
  >(null)

  // Star polygon points (5-point star)
  const starPath = `polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)`
  // Diamond shape
  const diamondPath = `polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)`
  // Flat-top hexagon (properly proportioned)
  const hexagonPath = `polygon(25% 6%, 75% 6%, 100% 50%, 75% 94%, 25% 94%, 0% 50%)`
  // Triangle
  const trianglePath = `polygon(50% 5%, 95% 95%, 5% 95%)`

  return (
    <div css={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
      <div
        css={{
          width: '7rem',
          height: '7rem',
        }}
        onMouseEnter={() => setHoveredShape('diamond')}
        onMouseLeave={() => setHoveredShape(null)}
      >
        <div
          css={{
            width: '100%',
            height: '100%',
            background: 'linear-gradient(to bottom right, #34d399, #14b8a6)',
            transition: 'clip-path 500ms ease',
          }}
          style={{
            clipPath: hoveredShape === 'diamond' ? starPath : diamondPath,
          }}
        />
      </div>
      <div
        css={{
          width: '7rem',
          height: '7rem',
        }}
        onMouseEnter={() => setHoveredShape('hexagon')}
        onMouseLeave={() => setHoveredShape(null)}
      >
        <div
          css={{
            width: '100%',
            height: '100%',
            background: 'linear-gradient(to bottom right, #fb923c, #e11d48)',
            transition: 'clip-path 500ms ease',
          }}
          style={{
            clipPath: hoveredShape === 'hexagon' ? trianglePath : hexagonPath,
          }}
        />
      </div>
    </div>
  )
}

export function AnimationExample() {
  return (
    <div css={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
      <div css={{ position: 'relative', width: '4rem', height: '4rem' }}>
        <div
          css={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            background: 'linear-gradient(to right, #8b5cf6, #d946ef)',
            animation: 'pulse-ring 1.5s ease-out infinite',
          }}
        />
        <div
          css={{
            position: 'absolute',
            inset: '0.5rem',
            borderRadius: '50%',
            background: 'linear-gradient(to right, #7c3aed, #c026d3)',
          }}
        />
      </div>
      <div css={{ display: 'flex', gap: '0.25rem' }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            css={{
              width: '0.5rem',
              height: '3rem',
              background: 'linear-gradient(to top, #38bdf8, #2563eb)',
              borderRadius: '9999px',
              animation: 'bounce-bar 1s ease-in-out infinite',
            }}
            style={{ animationDelay: `${i * 0.1}s` }}
          />
        ))}
      </div>
      <div
        css={{
          width: '3rem',
          height: '3rem',
          borderRadius: '0.5rem',
          background: 'linear-gradient(to bottom right, #fbbf24, #ea580c)',
          animation: 'spin-slow 3s linear infinite',
        }}
      />
      <style>{`
        @keyframes pulse-ring {
          0% { transform: scale(1); opacity: 1; }
          100% { transform: scale(1.8); opacity: 0; }
        }
        @keyframes bounce-bar {
          0%, 100% { transform: scaleY(0.4); }
          50% { transform: scaleY(1); }
        }
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}

export function ShadowExample() {
  return (
    <div css={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
      <div
        css={{
          width: '6rem',
          height: '6rem',
          borderRadius: '1rem',
          backgroundColor: 'white',
          boxShadow: `
            0 0 0 1px rgba(0,0,0,0.05),
            0 1px 2px rgba(0,0,0,0.1),
            0 4px 8px rgba(0,0,0,0.1),
            0 8px 16px rgba(0,0,0,0.1),
            0 16px 32px rgba(0,0,0,0.15)
          `,
        }}
      />
      <div
        css={{
          width: '6rem',
          height: '6rem',
          borderRadius: '50%',
          background: 'linear-gradient(to bottom right, #fb7185, #db2777)',
          boxShadow: `
            0 0 40px rgba(244, 63, 94, 0.4),
            0 0 80px rgba(244, 63, 94, 0.2),
            inset 0 -4px 8px rgba(0,0,0,0.2)
          `,
        }}
      />
      <div
        css={{
          width: '6rem',
          height: '6rem',
          borderRadius: '0.75rem',
          backgroundColor: '#1e293b',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: `
            inset 4px 4px 8px rgba(0,0,0,0.4),
            inset -4px -4px 8px rgba(255,255,255,0.05)
          `,
        }}
      >
        <span css={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '0.75rem' }}>
          Inset
        </span>
      </div>
    </div>
  )
}

export function BlendModeExample() {
  // Circle diameter and offset for equilateral triangle positioning
  const size = '8rem'
  // Distance from center - controls overlap amount (smaller = more overlap)
  const offset = '2.5rem'

  return (
    <div
      css={{
        position: 'relative',
        width: '13rem',
        height: '12rem',
        // Isolate the blending context so all circles blend equally
        isolation: 'isolate',
      }}
    >
      {/* Red - top center */}
      <div
        css={{
          position: 'absolute',
          top: 0,
          left: '50%',
          transform: 'translateX(-50%)',
          width: size,
          height: size,
          borderRadius: '50%',
          backgroundColor: '#ef4444',
          mixBlendMode: 'screen',
        }}
      />
      {/* Green - bottom left */}
      <div
        css={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          width: size,
          height: size,
          borderRadius: '50%',
          backgroundColor: '#22c55e',
          mixBlendMode: 'screen',
        }}
      />
      {/* Blue - bottom right */}
      <div
        css={{
          position: 'absolute',
          bottom: 0,
          right: 0,
          width: size,
          height: size,
          borderRadius: '50%',
          backgroundColor: '#3b82f6',
          mixBlendMode: 'screen',
        }}
      />
    </div>
  )
}

export function FilterExample() {
  const [filter, setFilter] = useState('none')

  const filters = [
    { name: 'None', value: 'none' },
    { name: 'Blur', value: 'blur(4px)' },
    { name: 'Grayscale', value: 'grayscale(100%)' },
    { name: 'Sepia', value: 'sepia(100%)' },
    { name: 'Hue Rotate', value: 'hue-rotate(180deg)' },
    { name: 'Saturate', value: 'saturate(200%)' },
  ]

  return (
    <div
      css={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '1.5rem',
      }}
    >
      <div
        css={{
          width: '12rem',
          height: '8rem',
          borderRadius: '0.75rem',
          background:
            'linear-gradient(to bottom right, #38bdf8, #8b5cf6, #d946ef)',
          transition: 'filter 300ms ease',
        }}
        style={{ filter }}
      />
      <div
        css={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.5rem',
          justifyContent: 'center',
        }}
      >
        {filters.map((f) => (
          <button
            key={f.name}
            onClick={(e) => {
              e.stopPropagation()
              setFilter(f.value)
            }}
            css={{
              padding: '0.25rem 0.75rem',
              fontSize: '0.75rem',
              borderRadius: '9999px',
              border: 'none',
              cursor: 'pointer',
              transition: 'background-color 150ms ease',
              backgroundColor:
                filter === f.value
                  ? 'var(--color-foreground)'
                  : 'var(--color-surface-secondary)',
              color:
                filter === f.value
                  ? 'var(--color-background)'
                  : 'var(--color-foreground-secondary)',
              ':hover': {
                opacity: 0.8,
              },
            }}
          >
            {f.name}
          </button>
        ))}
      </div>
    </div>
  )
}

export function NeonGlowExample() {
  const [color, setColor] = useState<'cyan' | 'pink' | 'green'>('cyan')

  const colors = {
    cyan: {
      text: '#0ff',
      glow: '0 0 5px #0ff, 0 0 10px #0ff, 0 0 20px #0ff, 0 0 40px #0ff, 0 0 80px #0ff',
      border: '0 0 5px #0ff, inset 0 0 5px #0ff, 0 0 10px #0ff, 0 0 20px #0ff',
    },
    pink: {
      text: '#f0f',
      glow: '0 0 5px #f0f, 0 0 10px #f0f, 0 0 20px #f0f, 0 0 40px #f0f, 0 0 80px #f0f',
      border: '0 0 5px #f0f, inset 0 0 5px #f0f, 0 0 10px #f0f, 0 0 20px #f0f',
    },
    green: {
      text: '#0f0',
      glow: '0 0 5px #0f0, 0 0 10px #0f0, 0 0 20px #0f0, 0 0 40px #0f0, 0 0 80px #0f0',
      border: '0 0 5px #0f0, inset 0 0 5px #0f0, 0 0 10px #0f0, 0 0 20px #0f0',
    },
  }

  return (
    <div
      css={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '1.5rem',
      }}
    >
      <div
        css={{
          position: 'relative',
          padding: '2rem',
          borderRadius: '0.75rem',
          border: '2px solid rgba(255, 255, 255, 0.2)',
          backgroundColor: 'black',
        }}
        style={{ boxShadow: colors[color].border }}
      >
        <h2
          css={{
            fontSize: '2rem',
            fontWeight: 900,
            letterSpacing: '0.1em',
            animation: 'neon-flicker 2s infinite alternate',
          }}
          style={{
            color: colors[color].text,
            textShadow: colors[color].glow,
          }}
        >
          NEON
        </h2>
      </div>

      {/* Color switcher */}
      <div css={{ display: 'flex', gap: '0.5rem' }}>
        {(['cyan', 'pink', 'green'] as const).map((c) => (
          <button
            key={c}
            onClick={(e) => {
              e.stopPropagation()
              setColor(c)
            }}
            css={{
              width: '1.5rem',
              height: '1.5rem',
              borderRadius: '50%',
              border: '2px solid',
              borderColor: color === c ? 'white' : 'transparent',
              cursor: 'pointer',
              transition: 'border-color 150ms ease, transform 150ms ease',
              ':hover': {
                transform: 'scale(1.1)',
              },
            }}
            style={{
              backgroundColor: colors[c].text,
            }}
          />
        ))}
      </div>
      <style>{`
        @keyframes neon-flicker {
          0%, 19%, 21%, 23%, 25%, 54%, 56%, 100% {
            opacity: 1;
          }
          20%, 24%, 55% {
            opacity: 0.8;
          }
        }
      `}</style>
    </div>
  )
}

export function FormExample() {
  const [focused, setFocused] = useState<string | null>(null)
  const [agreed, setAgreed] = useState(false)

  const stopPropagation = (e: React.MouseEvent) => e.stopPropagation()

  return (
    <div
      css={{
        width: '100%',
        maxWidth: '22rem',
        padding: '2rem',
        borderRadius: '1.25rem',
        background:
          'linear-gradient(145deg, rgba(30, 41, 59, 0.9), rgba(15, 23, 42, 0.95))',
        border: '1px solid rgba(148, 163, 184, 0.1)',
        boxShadow:
          '0 25px 50px -12px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
      }}
    >
      <h3
        css={{
          fontSize: '1.5rem',
          fontWeight: 700,
          marginBottom: '1.5rem',
          background: 'linear-gradient(135deg, #f8fafc, #94a3b8)',
          backgroundClip: 'text',
          WebkitBackgroundClip: 'text',
          color: 'transparent',
          letterSpacing: '-0.02em',
        }}
      >
        Get Started
      </h3>

      <div css={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div css={{ position: 'relative' }}>
          <input
            type="text"
            placeholder="Full Name"
            onClick={stopPropagation}
            onFocus={() => setFocused('name')}
            onBlur={() => setFocused(null)}
            css={{
              width: '100%',
              padding: '0.875rem 1rem',
              paddingLeft: '2.75rem',
              fontSize: '0.9375rem',
              borderRadius: '0.75rem',
              border: '1px solid',
              borderColor:
                focused === 'name' ? '#6366f1' : 'rgba(148, 163, 184, 0.2)',
              backgroundColor: 'rgba(15, 23, 42, 0.6)',
              color: '#f1f5f9',
              outline: 'none',
              transition: 'all 200ms ease',
              boxShadow:
                focused === 'name'
                  ? '0 0 0 3px rgba(99, 102, 241, 0.15), inset 0 1px 2px rgba(0, 0, 0, 0.2)'
                  : 'inset 0 1px 2px rgba(0, 0, 0, 0.2)',
              '::placeholder': {
                color: 'rgba(148, 163, 184, 0.6)',
              },
            }}
          />
          <svg
            css={{
              position: 'absolute',
              left: '1rem',
              top: '50%',
              transform: 'translateY(-50%)',
              width: '1.125rem',
              height: '1.125rem',
              color:
                focused === 'name' ? '#6366f1' : 'rgba(148, 163, 184, 0.5)',
              transition: 'color 200ms ease',
              pointerEvents: 'none',
            }}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
            />
          </svg>
        </div>

        <div css={{ position: 'relative' }}>
          <input
            type="email"
            placeholder="Email Address"
            onClick={stopPropagation}
            onFocus={() => setFocused('email')}
            onBlur={() => setFocused(null)}
            css={{
              width: '100%',
              padding: '0.875rem 1rem',
              paddingLeft: '2.75rem',
              fontSize: '0.9375rem',
              borderRadius: '0.75rem',
              border: '1px solid',
              borderColor:
                focused === 'email' ? '#6366f1' : 'rgba(148, 163, 184, 0.2)',
              backgroundColor: 'rgba(15, 23, 42, 0.6)',
              color: '#f1f5f9',
              outline: 'none',
              transition: 'all 200ms ease',
              boxShadow:
                focused === 'email'
                  ? '0 0 0 3px rgba(99, 102, 241, 0.15), inset 0 1px 2px rgba(0, 0, 0, 0.2)'
                  : 'inset 0 1px 2px rgba(0, 0, 0, 0.2)',
              '::placeholder': {
                color: 'rgba(148, 163, 184, 0.6)',
              },
            }}
          />
          <svg
            css={{
              position: 'absolute',
              left: '1rem',
              top: '50%',
              transform: 'translateY(-50%)',
              width: '1.125rem',
              height: '1.125rem',
              color:
                focused === 'email' ? '#6366f1' : 'rgba(148, 163, 184, 0.5)',
              transition: 'color 200ms ease',
              pointerEvents: 'none',
            }}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            />
          </svg>
        </div>

        {/* Checkbox */}
        <label
          css={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.75rem',
            cursor: 'pointer',
            fontSize: '0.8125rem',
            color: 'rgba(148, 163, 184, 0.8)',
            lineHeight: 1.4,
          }}
          onClick={stopPropagation}
        >
          <div
            css={{
              position: 'relative',
              flexShrink: 0,
              marginTop: '0.125rem',
            }}
          >
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              css={{
                position: 'absolute',
                opacity: 0,
                width: '1.125rem',
                height: '1.125rem',
                cursor: 'pointer',
              }}
            />
            <div
              css={{
                width: '1.125rem',
                height: '1.125rem',
                borderRadius: '0.25rem',
                border: '1.5px solid',
                borderColor: agreed ? '#6366f1' : 'rgba(148, 163, 184, 0.3)',
                backgroundColor: agreed ? '#6366f1' : 'rgba(15, 23, 42, 0.6)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 200ms ease',
                boxShadow: agreed
                  ? '0 0 0 3px rgba(99, 102, 241, 0.15)'
                  : 'none',
              }}
            >
              {agreed && (
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="white"
                  strokeWidth={3}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </div>
          </div>
          <span>
            I agree to the{' '}
            <span css={{ color: '#818cf8' }}>Terms of Service</span> and{' '}
            <span css={{ color: '#818cf8' }}>Privacy Policy</span>
          </span>
        </label>

        <button
          type="button"
          onClick={stopPropagation}
          css={{
            width: '100%',
            padding: '0.875rem 1.5rem',
            marginTop: '0.5rem',
            fontSize: '0.9375rem',
            fontWeight: 600,
            borderRadius: '0.75rem',
            border: 'none',
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            color: 'white',
            cursor: 'pointer',
            transition: 'all 200ms ease',
            boxShadow:
              '0 4px 14px rgba(99, 102, 241, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.15)',
            ':hover': {
              transform: 'translateY(-1px)',
              boxShadow:
                '0 6px 20px rgba(99, 102, 241, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.15)',
            },
            ':active': {
              transform: 'translateY(0)',
            },
          }}
        >
          Continue
        </button>

        <p
          css={{
            textAlign: 'center',
            fontSize: '0.8125rem',
            color: 'rgba(148, 163, 184, 0.7)',
            marginTop: '0.25rem',
          }}
        >
          Already have an account?{' '}
          <span
            css={{
              color: '#818cf8',
              cursor: 'pointer',
              ':hover': { textDecoration: 'underline' },
            }}
            onClick={stopPropagation}
          >
            Sign in
          </span>
        </p>
      </div>
    </div>
  )
}
