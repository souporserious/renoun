'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { screenshot } from '@renoun/screenshot'
// @ts-expect-error - RenounLogo is internal
import { RenounLogo } from 'renoun/assets'
import { ExampleCard } from './components/ExampleCard'
import { ScreenshotStack } from './components/ScreenshotStack'

const examples = [
  {
    id: '3d-transforms',
    title: '3D Transforms',
    description: 'Perspective and transform-style preservation',
    component: 'Transform3DExample',
  },
  {
    id: 'text-gradients',
    title: 'Text Gradients',
    description: 'Background-clip text with gradients',
    component: 'TextGradientExample',
  },
  {
    id: 'glassmorphism',
    title: 'Glassmorphism',
    description: 'Backdrop-filter blur and transparency',
    component: 'GlassmorphismExample',
  },
  {
    id: 'clip-path',
    title: 'Clip Path',
    description: 'Polygon and shape clipping',
    component: 'ClipPathExample',
  },
  {
    id: 'animations',
    title: 'CSS Animations',
    description: 'Keyframes and animation states',
    component: 'AnimationExample',
  },
  {
    id: 'shadows',
    title: 'Complex Shadows',
    description: 'Multiple box-shadows and drop-shadows',
    component: 'ShadowExample',
  },
  {
    id: 'blend-modes',
    title: 'Blend Modes',
    description: 'Mix-blend-mode and background-blend-mode',
    component: 'BlendModeExample',
  },
  {
    id: 'filters',
    title: 'CSS Filters',
    description: 'Hue-rotate, saturate, and custom filters',
    component: 'FilterExample',
  },
  {
    id: 'neon-glow',
    title: 'Neon Glow',
    description: 'Text shadows and glowing effects',
    component: 'NeonGlowExample',
  },
  {
    id: 'form',
    title: 'Form Styling',
    description: 'Form inputs and button styling',
    component: 'FormExample',
  },
]

const cameraCursor = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='white' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'><path d='M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z'/><circle cx='12' cy='13' r='3'/></svg>") 12 12, pointer`

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mql = window.matchMedia(query)
    const handleChange = (event: MediaQueryListEvent) =>
      setMatches(event.matches)

    // Set initial match state
    setMatches(mql.matches)

    mql.addEventListener('change', handleChange)
    return () => mql.removeEventListener('change', handleChange)
  }, [query])

  return matches
}

export interface ScreenshotItem {
  url: string
  sourceRect: DOMRect
}

interface ScreenshotPageClientProps {
  codeBlockPlaceholder: React.ReactNode
}

export function ScreenshotPageClient({
  codeBlockPlaceholder,
}: ScreenshotPageClientProps) {
  const isDesktop = useMediaQuery('(min-width: 60rem)')
  const [screenshots, setScreenshots] = useState<ScreenshotItem[]>([])
  const [isCapturing, setIsCapturing] = useState(false)
  const [isGalleryOpen, setIsGalleryOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [isCaptureMode, setIsCaptureMode] = useState(false)
  const examplesRef = useRef<HTMLDivElement>(null)
  const screenshotUrlsRef = useRef<string[]>([])

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      screenshotUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [])

  const handleCaptureElement = useCallback(
    async (element: HTMLElement) => {
      // Don't capture if gallery modal is open
      if (isGalleryOpen) return

      setIsCapturing(true)
      try {
        const sourceRect = element.getBoundingClientRect()
        const url = await screenshot.url(element, {
          scale: 2,
          format: 'png',
        })
        screenshotUrlsRef.current.push(url)
        setScreenshots((prev) => [{ url, sourceRect }, ...prev])
      } catch (error) {
        console.error('Screenshot capture failed:', error)
      } finally {
        setIsCapturing(false)
      }
    },
    [isGalleryOpen]
  )

  const handleCopyInstall = async () => {
    await navigator.clipboard.writeText('npm install @renoun/screenshot')
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleRemoveScreenshot = useCallback((url: string) => {
    URL.revokeObjectURL(url)
    screenshotUrlsRef.current = screenshotUrlsRef.current.filter(
      (u) => u !== url
    )
    setScreenshots((prev) => prev.filter((s) => s.url !== url))
  }, [])

  return (
    <div
      css={{ minHeight: '100vh', backgroundColor: 'var(--color-background)' }}
    >
      {/* Mobile Layout */}
      <div
        css={{
          '@media (min-width: 60rem)': { display: 'none' },
        }}
      >
        <MobileLayout
          enableFlying={!isDesktop}
          screenshots={screenshots}
          isCapturing={isCapturing}
          isCaptureMode={isCaptureMode}
          onCaptureModeChange={setIsCaptureMode}
          onCopyInstall={handleCopyInstall}
          copied={copied}
          onCaptureElement={async (element) => {
            try {
              await handleCaptureElement(element)
            } finally {
              // Avoid accidental captures while scrolling on touch devices.
              setIsCaptureMode(false)
            }
          }}
          onModalOpenChange={setIsGalleryOpen}
          onRemoveScreenshot={handleRemoveScreenshot}
          codeBlockPlaceholder={codeBlockPlaceholder}
        />
      </div>

      {/* Desktop Layout - Side by Side */}
      <div
        css={{
          display: 'none',
          '@media (min-width: 60rem)': {
            display: 'flex',
            minHeight: '100vh',
          },
        }}
      >
        {/* Left Sticky Panel */}
        <div
          css={{
            width: '460px',
            flexShrink: 0,
            backgroundColor: 'hsl(215deg 47% 8%)',
            '@media (min-width: 80rem)': {
              width: '520px',
            },
          }}
        >
          <div
            css={{
              position: 'sticky',
              top: 0,
              height: '100vh',
              display: 'flex',
              flexDirection: 'column',
              padding: '0 2.5rem',
              borderRight: '1px solid rgba(255, 255, 255, 0.1)',
              overflowY: 'auto',
              overscrollBehavior: 'contain',
              '@media (min-width: 80rem)': {
                padding: '0 3.5rem',
              },
            }}
          >
            <LeftPanel
              screenshots={screenshots}
              isCapturing={isCapturing}
              onCopyInstall={handleCopyInstall}
              copied={copied}
              onModalOpenChange={setIsGalleryOpen}
              onRemoveScreenshot={handleRemoveScreenshot}
              codeBlockPlaceholder={codeBlockPlaceholder}
              enableFlying={isDesktop}
            />
          </div>
        </div>

        <div
          ref={examplesRef}
          css={{
            flex: 1,
            overflow: 'auto',
            cursor: cameraCursor,
          }}
        >
          <div css={{ display: 'flex', flexDirection: 'column' }}>
            {examples.map((example) => (
              <ExampleCard
                key={example.id}
                title={example.title}
                description={example.description}
                componentId={example.component}
                onCapture={handleCaptureElement}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function LeftPanel({
  screenshots,
  isCapturing,
  onCopyInstall,
  copied,
  onModalOpenChange,
  onRemoveScreenshot,
  codeBlockPlaceholder,
  enableFlying,
}: {
  screenshots: ScreenshotItem[]
  isCapturing: boolean
  onCopyInstall: () => void
  copied: boolean
  onModalOpenChange: (isOpen: boolean) => void
  onRemoveScreenshot: (url: string) => void
  codeBlockPlaceholder: React.ReactNode
  enableFlying?: boolean
}) {
  return (
    <div
      css={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        paddingBottom: '3rem',
      }}
    >
      {/* Logo */}
      <a
        href="/"
        css={{
          display: 'flex',
          alignItems: 'center',
          minHeight: 'var(--header-height)',
          marginBottom: '2rem',
        }}
      >
        <RenounLogo
          css={{
            width: 'unset',
            height: 'var(--font-size-heading-3)',
            fill: 'white',
          }}
        />
      </a>

      {/* Top spacer for vertical centering */}
      <div css={{ flex: 1 }} />

      {/* Content lockup - vertically centered */}
      <div css={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div>
          <h1
            css={{
              fontSize: '2rem',
              fontWeight: 'var(--font-weight-heading)',
              color: 'var(--color-foreground)',
              letterSpacing: '-0.02em',
              marginBottom: '1rem',
              whiteSpace: 'nowrap',
            }}
          >
            <span
              css={{
                fontFamily: 'var(--font-family-mono, monospace)',
                color: 'var(--color-surface-accent)',
              }}
            >
              @renoun/
            </span>
            screenshot
          </h1>
          <p
            css={{
              color: 'var(--color-foreground-interactive)',
              fontSize: 'var(--font-size-body-1)',
              lineHeight: 'var(--line-height-body-1)',
              textWrap: 'balance',
            }}
          >
            Capture any HTML element with pixel-perfect accuracy
          </p>
        </div>

        <div css={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <FeatureItem>Captures 2D/3D transforms</FeatureItem>
          <FeatureItem>Supports text gradients and clipping</FeatureItem>
          <FeatureItem>Renders backdrop filters and blend modes</FeatureItem>
          <FeatureItem>Implements modern CSS features</FeatureItem>
        </div>

        {/* Screenshots or code block - directly under features */}
        <ScreenshotStack
          screenshots={screenshots}
          onModalOpenChange={onModalOpenChange}
          onRemove={onRemoveScreenshot}
          codeBlockPlaceholder={codeBlockPlaceholder}
          enableFlying={enableFlying}
          openOnClick
        />
      </div>

      {/* Bottom spacer for vertical centering */}
      <div css={{ flex: 1 }} />

      {/* Bottom pinned buttons */}
      <div css={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <button
          onClick={onCopyInstall}
          css={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            width: '100%',
            padding: '0.875rem 1.5rem',
            backgroundColor: 'var(--color-surface-accent)',
            color: '#0c0900',
            fontFamily: 'var(--font-family-mono, monospace)',
            fontSize: '0.9rem',
            fontWeight: 'var(--font-weight-button)',
            border: 'none',
            borderRadius: '0.375rem',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            transition: 'transform 150ms ease, box-shadow 200ms ease',
            ':hover': {
              transform: 'translateY(-1px)',
              boxShadow: '0 12px 24px rgba(247, 201, 72, 0.2)',
            },
          }}
        >
          {copied ? (
            <>
              <CheckIcon />
              Copied!
            </>
          ) : (
            <>
              <CopyIcon />
              npm install @renoun/screenshot
            </>
          )}
        </button>
        <a
          href="https://github.com/souporserious/renoun/tree/main/packages/screenshot"
          target="_blank"
          rel="noopener noreferrer"
          css={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            width: '100%',
            padding: '0.875rem 1.5rem',
            backgroundColor: 'transparent',
            color: 'var(--color-foreground)',
            fontSize: 'var(--font-size-button-2)',
            fontWeight: 'var(--font-weight-button)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: '0.375rem',
            textDecoration: 'none',
            whiteSpace: 'nowrap',
            transition: 'background-color 150ms ease',
            ':hover': {
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
            },
          }}
        >
          <GitHubIcon />
          View on GitHub
        </a>
      </div>
    </div>
  )
}

function MobileLayout({
  screenshots,
  isCapturing,
  isCaptureMode,
  onCaptureModeChange,
  onCopyInstall,
  copied,
  onCaptureElement,
  onModalOpenChange,
  onRemoveScreenshot,
  codeBlockPlaceholder,
  enableFlying,
}: {
  screenshots: ScreenshotItem[]
  isCapturing: boolean
  isCaptureMode: boolean
  onCaptureModeChange: (isCaptureMode: boolean) => void
  onCopyInstall: () => void
  copied: boolean
  onCaptureElement: (element: HTMLElement) => void
  onModalOpenChange: (isOpen: boolean) => void
  onRemoveScreenshot: (url: string) => void
  codeBlockPlaceholder: React.ReactNode
  enableFlying?: boolean
}) {
  const hasScreenshots = screenshots.length > 0

  return (
    <div css={{ paddingBottom: hasScreenshots ? '14rem' : '5rem' }}>
      {/* Hero Section */}
      <div
        css={{
          padding: '2rem 2rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.5rem',
          backgroundColor: 'hsl(215deg 47% 8%)',
        }}
      >
        {/* Logo */}
        <a
          href="/"
          css={{
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <RenounLogo
            css={{
              width: 'unset',
              height: 'var(--font-size-heading-3)',
              fill: 'white',
            }}
          />
        </a>

        <h1
          css={{
            fontSize: '1.875rem',
            fontWeight: 'var(--font-weight-heading)',
            color: 'var(--color-foreground)',
            letterSpacing: '-0.02em',
            whiteSpace: 'nowrap',
          }}
        >
          <span
            css={{
              fontFamily: 'var(--font-family-mono, monospace)',
              color: 'var(--color-surface-accent)',
            }}
          >
            @renoun/
          </span>
          screenshot
        </h1>
        <p
          css={{
            color: 'var(--color-foreground-interactive)',
            lineHeight: 1.6,
          }}
        >
          The screenshot library that actually works. Capture any CSS feature
          with pixel-perfect accuracy.
        </p>

        <div css={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <FeatureItem>Captures 2D/3D transforms</FeatureItem>
          <FeatureItem>Supports text gradients and clipping</FeatureItem>
          <FeatureItem>Renders backdrop filters and blend modes</FeatureItem>
          <FeatureItem>Implements modern CSS features</FeatureItem>
        </div>

        <div css={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <button
            onClick={onCopyInstall}
            css={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              width: '100%',
              padding: '0.875rem 1.5rem',
              backgroundColor: 'var(--color-surface-accent)',
              color: '#0c0900',
              fontFamily: 'var(--font-family-mono, monospace)',
              fontSize: 'var(--font-size-button-2)',
              fontWeight: 'var(--font-weight-button)',
              border: 'none',
              borderRadius: '0.375rem',
              cursor: 'pointer',
            }}
          >
            {copied ? (
              <>
                <CheckIcon />
                Copied!
              </>
            ) : (
              <>
                <CopyIcon />
                npm install @renoun/screenshot
              </>
            )}
          </button>
          <a
            href="https://github.com/souporserious/renoun/tree/main/packages/screenshot"
            target="_blank"
            rel="noopener noreferrer"
            css={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              width: '100%',
              padding: '0.875rem 1.5rem',
              backgroundColor: 'transparent',
              color: 'var(--color-foreground)',
              fontSize: 'var(--font-size-button-2)',
              fontWeight: 'var(--font-weight-button)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '0.375rem',
              textDecoration: 'none',
            }}
          >
            <GitHubIcon />
            GitHub
          </a>
        </div>
      </div>

      <div css={{ cursor: cameraCursor }}>
        <div css={{ display: 'flex', flexDirection: 'column' }}>
          {examples.map((example) => (
            <ExampleCard
              key={example.id}
              title={example.title}
              description={example.description}
              componentId={example.component}
              onCapture={onCaptureElement}
            />
          ))}
        </div>
      </div>

      {/* Screenshot stack: always fixed on mobile for consistent animation target */}
      <div
        css={{
          position: 'fixed',
          left: 'calc(1rem + env(safe-area-inset-left))',
          bottom: 'calc(1rem + env(safe-area-inset-bottom))',
          zIndex: 60,
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
          pointerEvents: hasScreenshots ? 'auto' : 'none',
        }}
      >
        <ScreenshotStack
          screenshots={screenshots}
          onModalOpenChange={onModalOpenChange}
          onRemove={onRemoveScreenshot}
          enableFlying={enableFlying}
          variant="floating"
          openOnClick={hasScreenshots}
        />
      </div>

      <button
        onClick={() => onCaptureModeChange(!isCaptureMode)}
        aria-label={isCaptureMode ? 'Exit capture mode' : 'Enter capture mode'}
        css={{
          position: 'fixed',
          bottom: '1rem',
          right: '1rem',
          zIndex: 50,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '4rem',
          height: '4rem',
          padding: 0,
          backgroundColor: isCaptureMode
            ? 'rgba(255, 255, 255, 0.12)'
            : 'var(--color-surface-accent)',
          color: isCaptureMode ? 'white' : '#0c0900',
          border: 'none',
          borderRadius: '50%',
          cursor: 'pointer',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
          backdropFilter: isCaptureMode ? 'blur(8px)' : undefined,
          WebkitBackdropFilter: isCaptureMode ? 'blur(8px)' : undefined,
        }}
      >
        {isCapturing ? <CheckIcon size={28} /> : <CameraIcon size={28} />}
      </button>

      {isCaptureMode && (
        <div
          css={{
            position: 'fixed',
            right: '1rem',
            bottom: '5.25rem',
            zIndex: 50,
            padding: '0.5rem 0.75rem',
            borderRadius: '0.5rem',
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            color: 'white',
            fontSize: '0.875rem',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            maxWidth: 'min(16rem, calc(100vw - 2rem))',
          }}
        >
          Tap an example to capture
        </div>
      )}
    </div>
  )
}

function FeatureItem({ children }: { children: React.ReactNode }) {
  return (
    <div
      css={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        fontSize: 'var(--font-size-body-2)',
        color: 'var(--color-foreground-secondary)',
      }}
    >
      <div
        css={{
          width: '1rem',
          height: '1rem',
          borderRadius: '50%',
          backgroundColor: 'rgba(247, 201, 72, 0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <CheckIcon size={10} color="var(--color-surface-accent)" />
      </div>
      {children}
    </div>
  )
}

function CheckIcon({
  size = 16,
  color = 'currentColor',
}: {
  size?: number
  color?: string
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function CopyIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

function CameraIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
      <circle cx="12" cy="13" r="3" />
    </svg>
  )
}

function GitHubIcon() {
  return (
    <svg
      aria-label="GitHub"
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="currentColor"
    >
      <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z" />
    </svg>
  )
}
