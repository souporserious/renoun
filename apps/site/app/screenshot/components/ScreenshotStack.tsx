'use client'

import {
  useMemo,
  useRef,
  useEffect,
  useState,
  useCallback,
  useLayoutEffect,
} from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'motion/react'
import { styled } from 'restyle'
// @ts-expect-error
import { lockScrollbars } from 'lock-scrollbars'

const StyledMotionDiv = styled(motion.div)

export interface ScreenshotItem {
  url: string
  sourceRect: DOMRect
}

interface ScreenshotStackProps {
  screenshots: ScreenshotItem[]
  onModalOpenChange?: (isOpen: boolean) => void
  onRemove?: (url: string) => void
  codeBlockPlaceholder?: React.ReactNode
  variant?: 'inline' | 'floating'
  openOnClick?: boolean
  enableFlying?: boolean
}

function seededRandom(seed: number) {
  const x = Math.sin(seed) * 10000
  return x - Math.floor(x)
}

// Fixed size for all screenshots - no variation
const CARD_WIDTH = 240
const CARD_HEIGHT = 160
// Smaller card size for floating variant (mobile)
const CARD_WIDTH_FLOATING = 96
const CARD_HEIGHT_FLOATING = 64
const MODAL_NAV_GUTTER_PX = 112 // 3rem button + ~1.5rem gap + breathing room (each side)
const MAX_STACK_CARDS = 5 // Only render this many cards in the stack view

function generateTransformForScreenshot(
  screenshotUrl: string,
  index: number,
  total: number
) {
  const hash = screenshotUrl
    .split('')
    .reduce((acc, char) => acc + char.charCodeAt(0), 0)
  const seed = hash + index * 1337

  // Keep the stack centered but with a touch more dynamism
  const rotationRange = index === 0 ? 10 : 14
  const offsetRangeX = index === 0 ? 12 : 18
  const offsetRangeY = index === 0 ? 8 : 12

  // Generate random rotation with subtle alternating offset to prevent parallels
  const baseRotation = (seededRandom(seed) - 0.5) * rotationRange
  // Add a small alternating nudge (±1.5°) to break up accidental parallels
  const nudge = (index % 2 === 0 ? 1 : -1) * 1.5
  const rotation = baseRotation + nudge

  const offsetX = (seededRandom(seed + 1) - 0.5) * offsetRangeX
  const offsetY = (seededRandom(seed + 2) - 0.5) * offsetRangeY
  // Back cards slightly smaller (realistic perspective)
  const scale = 1 - index * 0.012

  return {
    x: offsetX,
    y: offsetY,
    rotate: rotation,
    scale,
    zIndex: total - index,
    opacity: 1, // All cards fully opaque
  }
}

// Single flying screenshot component - handles one screenshot at a time
function FlyingScreenshot({
  item,
  containerRect,
  onComplete,
  targetTransform,
  cardWidth,
  cardHeight,
  variant,
}: {
  item: ScreenshotItem
  containerRect: DOMRect
  onComplete: (url: string) => void
  targetTransform?: {
    x: number
    y: number
    rotate: number
    scale: number
  }
  cardWidth: number
  cardHeight: number
  variant: 'inline' | 'floating'
}) {
  const [phase, setPhase] = useState<'liftoff' | 'fly'>('liftoff')

  const { url, sourceRect } = item

  // Calculate the actual source dimensions
  const sourceWidth = sourceRect.width
  const sourceHeight = sourceRect.height

  // Calculate positions in screen coordinates
  const stackCenterX = containerRect.left + containerRect.width / 2
  const stackCenterY = containerRect.top + containerRect.height / 2

  // Source position (center of the captured element)
  const sourceCenterX = sourceRect.left + sourceRect.width / 2
  const sourceCenterY = sourceRect.top + sourceRect.height / 2

  const targetX = stackCenterX + (targetTransform?.x ?? 0)
  const targetY = stackCenterY + (targetTransform?.y ?? 0)
  const targetRotate = targetTransform?.rotate ?? 0
  const targetScale = targetTransform?.scale ?? 1

  return (
    <motion.div
      initial={{
        opacity: 0,
        x: sourceCenterX,
        y: sourceCenterY,
        width: sourceWidth,
        height: sourceHeight,
        marginLeft: -sourceWidth / 2,
        marginTop: -sourceHeight / 2,
        scale: 1,
        rotate: 0,
      }}
      exit={{
        opacity: 1,
        transition: { duration: 0.001, ease: 'linear' },
      }}
      animate={
        phase === 'liftoff'
          ? {
              opacity: 1,
              x: sourceCenterX,
              y: sourceCenterY - 40,
              width: sourceWidth,
              height: sourceHeight,
              marginLeft: -sourceWidth / 2,
              marginTop: -sourceHeight / 2,
              scale: 1.02,
              rotate: -1,
            }
          : {
              opacity: 1,
              x: targetX,
              y: targetY,
              width: cardWidth,
              height: cardHeight,
              marginLeft: -cardWidth / 2,
              marginTop: -cardHeight / 2,
              scale: targetScale,
              rotate: targetRotate,
            }
      }
      transition={
        phase === 'liftoff'
          ? {
              type: 'spring',
              stiffness: 640,
              damping: 24,
              mass: 0.6,
              opacity: { duration: 0.05, ease: 'linear' },
            }
          : {
              type: 'spring',
              stiffness: 180,
              damping: 24,
              mass: 1,
            }
      }
      onAnimationComplete={() => {
        if (phase === 'liftoff') {
          setPhase('fly')
        } else {
          onComplete(url)
        }
      }}
      style={{
        position: 'fixed',
        left: 0,
        top: 0,
        borderRadius: variant === 'floating' ? '0.375rem' : '0.5rem',
        overflow: 'hidden',
        backgroundColor: 'var(--color-surface)',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        boxShadow: '0 30px 50px -12px rgba(0, 0, 0, 0.6)',
        zIndex: 9998,
        pointerEvents: 'none',
        transformOrigin: 'center center',
      }}
    >
      <img
        src={url}
        alt="Flying screenshot"
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          pointerEvents: 'none',
        }}
      />
    </motion.div>
  )
}

export function ScreenshotStack({
  screenshots,
  onModalOpenChange,
  onRemove,
  codeBlockPlaceholder,
  variant = 'inline',
  openOnClick = false,
  enableFlying = true,
}: ScreenshotStackProps) {
  const cardWidth = variant === 'floating' ? CARD_WIDTH_FLOATING : CARD_WIDTH
  const cardHeight = variant === 'floating' ? CARD_HEIGHT_FLOATING : CARD_HEIGHT
  const containerRef = useRef<HTMLDivElement>(null)
  const cardRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const [containerRect, setContainerRect] = useState<DOMRect | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const unlockScrollbarsRef = useRef<null | (() => void)>(null)
  const [isHovered, setIsHovered] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [openingAnimation, setOpeningAnimation] = useState<{
    x: number
    y: number
  } | null>(null)
  const isDraggingRef = useRef(false)
  const [removing, setRemoving] = useState<{ url: string; dir: number } | null>(
    null
  )
  // Track the hover state when drag started to keep animation target stable
  const [hoverWhenDragStarted, setHoverWhenDragStarted] = useState<
    boolean | null
  >(null)
  // Persist transforms per screenshot so their positions never reshuffle
  const transformCacheRef = useRef<
    Map<
      string,
      {
        x: number
        y: number
        rotate: number
        scale: number
        opacity: number
      }
    >
  >(new Map())

  // Track which URLs have "landed" (completed fly animation)
  // Initialize with all existing URLs so only NEW screenshots fly
  const [landedUrls, setLandedUrls] = useState<Set<string>>(
    () => new Set(screenshots.map((s) => s.url))
  )

  // Only render/transform screenshots that have landed to keep the stack stable
  const stackScreenshots = useMemo(
    () => screenshots.filter((s) => landedUrls.has(s.url)),
    [screenshots, landedUrls]
  )

  // The flying screenshot is ONLY the newest one (index 0) IF it hasn't landed yet
  const flyingScreenshot = useMemo(() => {
    if (!enableFlying) return null
    const first = screenshots[0]
    // Only fly if this is a genuinely new screenshot and within visible stack
    if (first && first.sourceRect && !landedUrls.has(first.url)) {
      // Check if it will be visible in the stack
      const visibleIndex = screenshots
        .slice(0, MAX_STACK_CARDS)
        .findIndex((s) => s.url === first.url)
      if (visibleIndex !== -1) {
        return first
      }
    }
    return null
  }, [enableFlying, screenshots, landedUrls])

  const [activeFlyingUrl, setActiveFlyingUrl] = useState<string | null>(null)

  useEffect(() => {
    if (flyingScreenshot?.url) {
      setActiveFlyingUrl(flyingScreenshot.url)
    }
  }, [flyingScreenshot?.url])

  // Notify parent when modal state changes
  useEffect(() => {
    onModalOpenChange?.(isModalOpen)
  }, [isModalOpen, onModalOpenChange])

  // Lock scrollbars while modal is open
  useEffect(() => {
    if (!isModalOpen) {
      unlockScrollbarsRef.current?.()
      unlockScrollbarsRef.current = null
      return
    }

    unlockScrollbarsRef.current = lockScrollbars()
    return () => {
      unlockScrollbarsRef.current?.()
      unlockScrollbarsRef.current = null
    }
  }, [isModalOpen])

  // If flying is disabled (e.g., hidden breakpoint), immediately mark all screenshots landed
  useEffect(() => {
    if (!enableFlying) {
      setLandedUrls(new Set(screenshots.map((s) => s.url)))
    }
  }, [enableFlying, screenshots])

  // Update container rect on mount and when screenshots change
  useLayoutEffect(() => {
    if (containerRef.current) {
      setContainerRect(containerRef.current.getBoundingClientRect())
    }
  }, [screenshots.length])

  useEffect(() => {
    const updateRect = () => {
      if (containerRef.current) {
        setContainerRect(containerRef.current.getBoundingClientRect())
      }
    }
    window.addEventListener('resize', updateRect)
    return () => window.removeEventListener('resize', updateRect)
  }, [])

  const goToPrevious = useCallback(() => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : screenshots.length - 1))
  }, [screenshots.length])

  const goToNext = useCallback(() => {
    setCurrentIndex((prev) => (prev < screenshots.length - 1 ? prev + 1 : 0))
  }, [screenshots.length])

  const goToIndex = useCallback((index: number) => {
    setCurrentIndex(index)
  }, [])

  // Keyboard navigation
  useEffect(() => {
    if (!isModalOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsModalOpen(false)
      } else if (e.key === 'ArrowLeft') {
        goToPrevious()
      } else if (e.key === 'ArrowRight') {
        goToNext()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isModalOpen, goToPrevious, goToNext])

  const handleStackClick = useCallback(() => {
    if (screenshots.length > 0) {
      // Capture the top card's position for the transition
      const topCard = cardRefs.current.get(0)
      if (topCard) {
        const rect = topCard.getBoundingClientRect()
        const screenCenterX = window.innerWidth / 2
        const screenCenterY = window.innerHeight / 2
        const cardCenterX = rect.left + rect.width / 2
        const cardCenterY = rect.top + rect.height / 2
        setOpeningAnimation({
          x: cardCenterX - screenCenterX,
          y: cardCenterY - screenCenterY,
        })
      }
      setCurrentIndex(0)
      setIsModalOpen(true)
    }
  }, [screenshots.length])

  const handleBackdropClick = useCallback((event: React.MouseEvent) => {
    if (event.target === event.currentTarget) {
      setIsModalOpen(false)
    }
  }, [])

  const transforms = useMemo(() => {
    return stackScreenshots.slice(0, MAX_STACK_CARDS).map((item) => {
      const cached = transformCacheRef.current.get(item.url)
      if (cached) return cached
      const t = generateTransformForScreenshot(
        item.url,
        transformCacheRef.current.size,
        MAX_STACK_CARDS
      )
      transformCacheRef.current.set(item.url, t)
      return t
    })
  }, [stackScreenshots])

  // Landing pose for the incoming screenshot: use its persistent transform
  const landingTransform = useMemo(() => {
    if (!flyingScreenshot) return null
    const cached = transformCacheRef.current.get(flyingScreenshot.url)
    const base =
      cached ??
      generateTransformForScreenshot(
        flyingScreenshot.url,
        transformCacheRef.current.size,
        MAX_STACK_CARDS
      )
    if (!cached) transformCacheRef.current.set(flyingScreenshot.url, base)
    const effectiveHover =
      hoverWhenDragStarted !== null ? hoverWhenDragStarted : isHovered

    return {
      x: effectiveHover ? 0 : base.x,
      y: effectiveHover ? 0 : base.y,
      rotate: effectiveHover ? 0 : base.rotate,
      scale: effectiveHover ? 1 : base.scale,
    }
  }, [flyingScreenshot, hoverWhenDragStarted, isHovered])

  const hasScreenshots = screenshots.length > 0

  return (
    <>
      {/* Wrapper with consistent height */}
      <div
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={() => {
          if (!openOnClick) return
          if (isDraggingRef.current) return
          if (removing) return
          handleStackClick()
        }}
        onKeyDown={(event) => {
          if (!openOnClick) return
          if (!hasScreenshots) return
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            handleStackClick()
          }
        }}
        tabIndex={hasScreenshots ? 0 : undefined}
        css={{
          display: 'flex',
          flexDirection: 'column',
          minHeight: variant === 'inline' ? '12rem' : 'auto',
          marginTop: variant === 'inline' ? '2.5rem' : 0,
          cursor: openOnClick && hasScreenshots ? 'pointer' : 'default',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          outline: 'none',
          ':focus-visible': {
            outline: '2px solid rgba(247, 201, 72, 0.6)',
            outlineOffset: '6px',
            borderRadius: '0.75rem',
          },
        }}
      >
        <div
          ref={containerRef}
          css={{
            position: 'relative',
            height: variant === 'floating' ? `${cardHeight + 24}px` : '10rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: variant === 'floating' ? `${cardWidth + 24}px` : '100%',
          }}
        >
          <AnimatePresence initial={false}>
            {/* Code block placeholder - shown when no screenshots */}
            {!hasScreenshots && codeBlockPlaceholder && (
              <motion.div
                key="code-block"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{
                  duration: 0.3,
                  delay: 0.1,
                  ease: [0.4, 0, 0.2, 1],
                }}
                style={{
                  position: 'absolute',
                  width: '100%',
                }}
              >
                {codeBlockPlaceholder}
              </motion.div>
            )}

            {/* Screenshot stack - animated as a group */}
            {hasScreenshots && (
              <motion.div
                key="screenshot-stack"
                initial={{ opacity: 1 }}
                animate={{ opacity: 1 }}
                exit={{
                  opacity: 0,
                  scale: 0.95,
                }}
                transition={{
                  duration: 0.25,
                  ease: [0.4, 0, 0.2, 1],
                }}
                style={{
                  position: 'absolute',
                  inset: 0,
                }}
              >
                <AnimatePresence>
                  {stackScreenshots
                    .slice(0, MAX_STACK_CARDS)
                    .map((item, index) => {
                      const transform = transforms[index]
                      const isTopCard = index === 0

                      // Only render cards that have completed their fly-in
                      const hasLanded = landedUrls.has(item.url)
                      if (!hasLanded || !transform) {
                        return null
                      }

                      // Check if this screenshot is currently flying in (rendered via portal)
                      const isFlying = activeFlyingUrl === item.url
                      if (isFlying) {
                        // Don't render in the stack - it's being rendered via portal
                        return null
                      }

                      // When hovered, align cards with slight vertical offset
                      const hoverY = index * 4
                      const hoverScale = 1 - index * 0.02
                      // All cards should be fully opaque
                      const baseOpacity = 1

                      // Calculate animate target for settled cards
                      const getAnimateTarget = () => {
                        // Removal animation takes priority
                        if (removing?.url === item.url) {
                          return {
                            opacity: 0,
                            x: removing.dir * 300,
                            y: 0,
                            rotate: removing.dir * 12,
                            scale: 0.95,
                          }
                        }

                        // Settled: animate to stack position
                        const effectiveHover =
                          index === 0 && hoverWhenDragStarted !== null
                            ? hoverWhenDragStarted
                            : isHovered

                        return {
                          opacity: effectiveHover ? 1 : baseOpacity,
                          x: effectiveHover ? 0 : transform.x,
                          y: effectiveHover ? hoverY : transform.y,
                          rotate: effectiveHover ? 0 : transform.rotate,
                          scale: effectiveHover ? hoverScale : transform.scale,
                        }
                      }

                      return (
                        <motion.div
                          key={item.url}
                          ref={(el) => {
                            if (el) cardRefs.current.set(index, el)
                            else cardRefs.current.delete(index)
                          }}
                          onClick={() => {
                            if (!openOnClick) return
                            if (isDraggingRef.current) return
                            if (removing) return
                            handleStackClick()
                          }}
                          drag={
                            index === 0 && !!onRemove && !removing ? 'x' : false
                          }
                          dragElastic={0.5}
                          dragMomentum={false}
                          whileDrag={{
                            scale: 1.02,
                            cursor: 'grabbing',
                          }}
                          onDragStart={() => {
                            isDraggingRef.current = true
                            setHoverWhenDragStarted(isHovered)
                          }}
                          onDragEnd={(_, info) => {
                            isDraggingRef.current = false
                            setHoverWhenDragStarted(null)

                            if (!onRemove) return
                            if (index !== 0) return
                            if (removing) return

                            const offsetX = info.offset.x
                            const velocityX = info.velocity.x
                            const shouldRemove =
                              Math.abs(offsetX) > 80 ||
                              Math.abs(velocityX) > 300

                            if (shouldRemove) {
                              const dir =
                                Math.abs(velocityX) > 100
                                  ? Math.sign(velocityX)
                                  : Math.sign(offsetX)
                              setRemoving({
                                url: item.url,
                                dir: dir === 0 ? 1 : dir,
                              })
                            }
                          }}
                          initial={false}
                          animate={getAnimateTarget()}
                          exit={{
                            opacity: 0,
                            scale: 0.85,
                            y: 20,
                            transition: {
                              duration: 0.25,
                              ease: [0.4, 0, 0.2, 1],
                            },
                          }}
                          transition={{
                            type: 'spring',
                            stiffness: 300,
                            damping: 25,
                          }}
                          onAnimationComplete={() => {
                            if (removing?.url === item.url) {
                              onRemove?.(item.url)
                              setRemoving(null)
                            }
                          }}
                          style={{
                            position: 'absolute',
                            left: '50%',
                            top: '50%',
                            marginLeft: `-${cardWidth / 2}px`,
                            marginTop: `-${cardHeight / 2}px`,
                            borderRadius:
                              variant === 'floating' ? '0.375rem' : '0.5rem',
                            overflow: 'hidden',
                            border: '1px solid rgba(255, 255, 255, 0.2)',
                            backgroundColor: 'var(--color-surface)',
                            boxShadow:
                              variant === 'floating'
                                ? '0 8px 16px -4px rgba(0, 0, 0, 0.5)'
                                : '0 20px 40px -8px rgba(0, 0, 0, 0.5)',
                            width: `${cardWidth}px`,
                            height: `${cardHeight}px`,
                            zIndex: stackScreenshots.length - index,
                            touchAction:
                              index === 0 && !!onRemove ? 'pan-y' : undefined,
                          }}
                        >
                          <img
                            src={item.url}
                            alt={`Screenshot ${index + 1}`}
                            style={{
                              width: '100%',
                              height: '100%',
                              objectFit: 'cover',
                              pointerEvents: 'none',
                            }}
                          />
                        </motion.div>
                      )
                    })}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Flying screenshot - rendered via portal to appear above all content */}
      {enableFlying &&
        typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence
            mode="wait"
            onExitComplete={() => setActiveFlyingUrl(null)}
          >
            {flyingScreenshot && containerRect && (
              <FlyingScreenshot
                key={flyingScreenshot.url}
                item={flyingScreenshot}
                containerRect={containerRect}
                targetTransform={landingTransform ?? undefined}
                onComplete={(completedUrl) => {
                  // Mark this URL as landed
                  setLandedUrls((prev) => new Set([...prev, completedUrl]))
                  setActiveFlyingUrl((current) =>
                    current === completedUrl ? null : current
                  )
                }}
                cardWidth={cardWidth}
                cardHeight={cardHeight}
                variant={variant}
              />
            )}
          </AnimatePresence>,
          document.body
        )}

      {/* Modal Viewer - rendered via portal to avoid stacking context issues */}
      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {isModalOpen && (
              <StyledMotionDiv
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{
                  duration: 0.4,
                  ease: [0.4, 0, 0.2, 1],
                }}
                onClick={handleBackdropClick}
                style={{
                  position: 'fixed',
                  inset: 0,
                  zIndex: 9999,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: 'rgba(0, 0, 0, 0.9)',
                  backdropFilter: 'blur(8px)',
                  WebkitBackdropFilter: 'blur(8px)',
                }}
                css={{
                  // Mobile: flex column layout for bottom nav
                  '@media (max-width: 768px)': {
                    flexDirection: 'column',
                    justifyContent: 'flex-start',
                    paddingTop: '3.5rem',
                    paddingBottom: '5rem',
                  },
                }}
              >
                {/* Close button */}
                <button
                  onClick={() => setIsModalOpen(false)}
                  css={{
                    position: 'absolute',
                    top: '1rem',
                    right: '1rem',
                    width: '2.5rem',
                    height: '2.5rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: 'rgba(255, 255, 255, 0.1)',
                    border: 'none',
                    borderRadius: '50%',
                    color: 'white',
                    cursor: 'pointer',
                    fontSize: '1.5rem',
                    transition: 'background-color 150ms ease',
                    zIndex: 10,
                    ':hover': {
                      backgroundColor: 'rgba(255, 255, 255, 0.2)',
                    },
                    '@media (max-width: 768px)': {
                      width: '3rem',
                      height: '3rem',
                      fontSize: '1.75rem',
                    },
                  }}
                >
                  ×
                </button>

                {/* Counter */}
                <div
                  css={{
                    position: 'absolute',
                    top: '1rem',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    color: 'rgba(255, 255, 255, 0.7)',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    fontVariantNumeric: 'tabular-nums',
                    zIndex: 10,
                  }}
                >
                  {currentIndex + 1} / {screenshots.length}
                </div>

                {/* Navigation arrows - sides on desktop, bottom on mobile */}
                {screenshots.length > 1 && (
                  <div
                    css={{
                      // Desktop: position arrows on sides
                      '@media (min-width: 769px)': {
                        display: 'contents',
                      },
                      // Mobile: bottom bar
                      '@media (max-width: 768px)': {
                        position: 'absolute',
                        bottom: '1rem',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        display: 'flex',
                        gap: '1rem',
                        zIndex: 10,
                      },
                    }}
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        goToPrevious()
                      }}
                      aria-label="Previous screenshot"
                      css={{
                        width: '3rem',
                        height: '3rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: 'rgba(255, 255, 255, 0.1)',
                        border: 'none',
                        borderRadius: '50%',
                        color: 'white',
                        cursor: 'pointer',
                        transition:
                          'background-color 150ms ease, transform 100ms ease',
                        ':hover': {
                          backgroundColor: 'rgba(255, 255, 255, 0.2)',
                        },
                        ':active': {
                          transform: 'scale(0.9)',
                          backgroundColor: 'rgba(255, 255, 255, 0.25)',
                        },
                        // Mobile: bigger buttons
                        '@media (max-width: 768px)': {
                          width: '3.5rem',
                          height: '3.5rem',
                        },
                        // Desktop: absolute positioning on sides
                        '@media (min-width: 769px)': {
                          position: 'absolute',
                          left: '1.5rem',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          ':active': {
                            transform: 'translateY(-50%) scale(0.9)',
                          },
                        },
                      }}
                    >
                      <svg
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="15 18 9 12 15 6" />
                      </svg>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        goToNext()
                      }}
                      aria-label="Next screenshot"
                      css={{
                        width: '3rem',
                        height: '3rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: 'rgba(255, 255, 255, 0.1)',
                        border: 'none',
                        borderRadius: '50%',
                        color: 'white',
                        cursor: 'pointer',
                        transition:
                          'background-color 150ms ease, transform 100ms ease',
                        ':hover': {
                          backgroundColor: 'rgba(255, 255, 255, 0.2)',
                        },
                        ':active': {
                          transform: 'scale(0.9)',
                          backgroundColor: 'rgba(255, 255, 255, 0.25)',
                        },
                        // Mobile: bigger buttons
                        '@media (max-width: 768px)': {
                          width: '3.5rem',
                          height: '3.5rem',
                        },
                        // Desktop: absolute positioning on sides
                        '@media (min-width: 769px)': {
                          position: 'absolute',
                          right: '1.5rem',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          ':active': {
                            transform: 'translateY(-50%) scale(0.9)',
                          },
                        },
                      }}
                    >
                      <svg
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </button>
                  </div>
                )}

                {/* Image display with swipe support */}
                <StyledMotionDiv
                  key="modal-image-container"
                  drag={screenshots.length > 1 ? 'x' : false}
                  dragConstraints={{ left: 0, right: 0 }}
                  dragElastic={0.2}
                  onDragEnd={(_, info) => {
                    const threshold = 50
                    const velocity = info.velocity.x
                    const offset = info.offset.x
                    if (offset < -threshold || velocity < -500) {
                      goToNext()
                    } else if (offset > threshold || velocity > 500) {
                      goToPrevious()
                    }
                  }}
                  initial={
                    openingAnimation
                      ? {
                          scale: 0.2,
                          x: openingAnimation.x,
                          y: openingAnimation.y,
                          opacity: 1,
                        }
                      : { opacity: 0 }
                  }
                  animate={{
                    scale: 1,
                    x: 0,
                    y: 0,
                    opacity: 1,
                  }}
                  exit={{
                    opacity: 0,
                  }}
                  transition={{
                    type: 'spring',
                    stiffness: 200,
                    damping: 28,
                    mass: 1,
                  }}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    borderRadius: '0.5rem',
                    overflow: 'hidden',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                    cursor: screenshots.length > 1 ? 'grab' : 'default',
                  }}
                  css={{
                    ':active': {
                      cursor: screenshots.length > 1 ? 'grabbing' : 'default',
                    },
                    // Mobile: expand to fill viewport
                    '@media (max-width: 768px)': {
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '100%',
                      borderRadius: '0 !important',
                      boxShadow: 'none !important',
                    },
                  }}
                >
                  <img
                    src={screenshots[currentIndex]?.url}
                    alt={`Screenshot ${currentIndex + 1}`}
                    draggable={false}
                    css={{
                      // Desktop: constrained with gutters for arrows
                      maxWidth: `min(90vw, calc(100vw - ${MODAL_NAV_GUTTER_PX * 2}px))`,
                      maxHeight: '80vh',
                      objectFit: 'contain',
                      display: 'block',
                      // Mobile: full viewport
                      '@media (max-width: 768px)': {
                        maxWidth: '100vw',
                        maxHeight: '100%',
                        width: '100%',
                        height: 'auto',
                      },
                    }}
                  />
                </StyledMotionDiv>

                {/* Thumbnail strip - hidden on mobile */}
                {screenshots.length > 1 && (
                  <div
                    css={{
                      position: 'absolute',
                      bottom: '1.5rem',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      maxWidth: 'calc(100vw - 3rem)',
                      overflowX: 'auto',
                      overflowY: 'hidden',
                      // Hide scrollbar but keep functionality
                      scrollbarWidth: 'none',
                      msOverflowStyle: 'none',
                      '::-webkit-scrollbar': {
                        display: 'none',
                      },
                      // Hide on mobile
                      '@media (max-width: 768px)': {
                        display: 'none',
                      },
                    }}
                  >
                    <div
                      css={{
                        display: 'flex',
                        gap: '0.5rem',
                        padding: '0.25rem',
                        // Start from center, grow to the right
                        justifyContent: 'flex-start',
                      }}
                    >
                      {screenshots.map((item, index) => (
                        <button
                          key={item.url}
                          onClick={(e) => {
                            e.stopPropagation()
                            goToIndex(index)
                          }}
                          css={{
                            flexShrink: 0,
                            width: '3rem',
                            height: '2rem',
                            padding: 0,
                            border:
                              index === currentIndex
                                ? '2px solid white'
                                : '2px solid transparent',
                            borderRadius: '0.25rem',
                            overflow: 'hidden',
                            cursor: 'pointer',
                            opacity: index === currentIndex ? 1 : 0.5,
                            transition:
                              'opacity 150ms ease, border-color 150ms ease, transform 100ms ease',
                            ':hover': {
                              opacity: 1,
                            },
                            ':active': {
                              transform: 'scale(0.95)',
                            },
                          }}
                        >
                          <img
                            src={item.url}
                            alt={`Thumbnail ${index + 1}`}
                            css={{
                              width: '100%',
                              height: '100%',
                              objectFit: 'cover',
                            }}
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </StyledMotionDiv>
            )}
          </AnimatePresence>,
          document.body
        )}
    </>
  )
}
