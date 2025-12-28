'use client'

import { useMemo, useRef, useEffect, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'motion/react'

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
const MODAL_NAV_GUTTER_PX = 112 // 3rem button + ~1.5rem gap + breathing room (each side)
const MAX_STACK_CARDS = 5 // Only render this many cards in the stack view

// Animation phases for new screenshots
type AnimationPhase = 'liftoff' | 'fly' | 'settled'

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
    opacity: Math.max(0.6, 1 - index * 0.1),
  }
}

// Single flying screenshot component - handles one screenshot at a time
function FlyingScreenshot({
  item,
  containerRect,
  onComplete,
  targetTransform,
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
}) {
  const [phase, setPhase] = useState<'liftoff' | 'fly'>('liftoff')
  const [imageLoaded, setImageLoaded] = useState(false)

  const { url, sourceRect } = item

  // Preload the image to avoid flash of unstyled content
  useEffect(() => {
    const img = new Image()
    img.onload = () => setImageLoaded(true)
    img.src = url
    // If it's already cached, onload fires synchronously
    if (img.complete) setImageLoaded(true)
  }, [url])

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

  // Don't render until image is loaded to prevent flash
  if (!imageLoaded) {
    return null
  }

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
              width: CARD_WIDTH,
              height: CARD_HEIGHT,
              marginLeft: -CARD_WIDTH / 2,
              marginTop: -CARD_HEIGHT / 2,
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
        borderRadius: '0.5rem',
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
  const containerRef = useRef<HTMLDivElement>(null)
  const cardRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const [containerRect, setContainerRect] = useState<DOMRect | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const [isFocusWithin, setIsFocusWithin] = useState(false)
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

  // Track the previous screenshot count to detect new additions
  const prevCountRef = useRef(screenshots.length)

  // Only render/transform screenshots that have landed to keep the stack stable
  const stackScreenshots = useMemo(
    () => screenshots.filter((s) => landedUrls.has(s.url)),
    [screenshots, landedUrls]
  )

  // The flying screenshot is ONLY the newest one (index 0) IF:
  // 1. A new screenshot was just added (count increased)
  // 2. It hasn't landed yet
  const flyingScreenshot = useMemo(() => {
    if (!enableFlying) return null
    const first = screenshots[0]
    // Only fly if this is a genuinely new screenshot
    if (first && first.sourceRect && !landedUrls.has(first.url)) {
      return first
    }
    return null
  }, [enableFlying, screenshots, landedUrls])

  const [activeFlyingUrl, setActiveFlyingUrl] = useState<string | null>(null)

  useEffect(() => {
    if (flyingScreenshot?.url) {
      setActiveFlyingUrl(flyingScreenshot.url)
    }
  }, [flyingScreenshot?.url])

  // When screenshot count increases, the new one will automatically fly
  // because it won't be in landedUrls
  useEffect(() => {
    prevCountRef.current = screenshots.length
  }, [screenshots.length])

  // Notify parent when modal state changes
  useEffect(() => {
    onModalOpenChange?.(isModalOpen)
  }, [isModalOpen, onModalOpenChange])

  // If flying is disabled (e.g., hidden breakpoint), immediately mark all screenshots landed
  useEffect(() => {
    if (!enableFlying) {
      setLandedUrls(new Set(screenshots.map((s) => s.url)))
    }
  }, [enableFlying, screenshots])

  useEffect(() => {
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

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      setIsModalOpen(false)
    }
  }, [])

  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false)
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
        onFocusCapture={() => setIsFocusWithin(true)}
        onBlurCapture={(e) => {
          // Only clear when focus leaves the wrapper entirely
          if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
          setIsFocusWithin(false)
        }}
        onClick={() => {
          if (!openOnClick) return
          if (isDraggingRef.current) return
          if (removing) return
          handleStackClick()
        }}
        onKeyDown={(e) => {
          if (!openOnClick) return
          if (!hasScreenshots) return
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
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
            height: '10rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: variant === 'floating' ? `${CARD_WIDTH}px` : '100%',
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
                      const baseOpacity = isTopCard ? 1 : transform.opacity

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
                            transition: { duration: 0.15 },
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
                            marginLeft: `-${CARD_WIDTH / 2}px`,
                            marginTop: `-${CARD_HEIGHT / 2}px`,
                            borderRadius: '0.5rem',
                            overflow: 'hidden',
                            border: '1px solid rgba(255, 255, 255, 0.2)',
                            backgroundColor: 'var(--color-surface)',
                            boxShadow: '0 20px 40px -8px rgba(0, 0, 0, 0.5)',
                            width: `${CARD_WIDTH}px`,
                            height: `${CARD_HEIGHT}px`,
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
                  // Mark this URL as landed - use the URL passed from FlyingScreenshot
                  // not from closure, to avoid stale closure issues
                  setLandedUrls((prev) => new Set([...prev, completedUrl]))
                  setActiveFlyingUrl((current) =>
                    current === completedUrl ? null : current
                  )
                }}
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
              <motion.div
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
              >
                {/* Close button */}
                <button
                  onClick={() => setIsModalOpen(false)}
                  css={{
                    position: 'absolute',
                    top: '1.5rem',
                    right: '1.5rem',
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
                    ':hover': {
                      backgroundColor: 'rgba(255, 255, 255, 0.2)',
                    },
                  }}
                >
                  ×
                </button>

                {/* Counter */}
                <div
                  css={{
                    position: 'absolute',
                    top: '1.5rem',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    color: 'rgba(255, 255, 255, 0.7)',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {currentIndex + 1} / {screenshots.length}
                </div>

                {/* Navigation arrows */}
                {screenshots.length > 1 && (
                  <>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        goToPrevious()
                      }}
                      aria-label="Previous screenshot"
                      css={{
                        position: 'absolute',
                        left: '1.5rem',
                        top: '50%',
                        transform: 'translateY(-50%)',
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
                          transform: 'translateY(-50%) scale(0.9)',
                          backgroundColor: 'rgba(255, 255, 255, 0.25)',
                        },
                      }}
                    >
                      <svg
                        width="20"
                        height="20"
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
                        position: 'absolute',
                        right: '1.5rem',
                        top: '50%',
                        transform: 'translateY(-50%)',
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
                          transform: 'translateY(-50%) scale(0.9)',
                          backgroundColor: 'rgba(255, 255, 255, 0.25)',
                        },
                      }}
                    >
                      <svg
                        width="20"
                        height="20"
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
                  </>
                )}

                {/* Image display - instant swap for easy comparison */}
                <motion.div
                  key="modal-image-container"
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
                  }}
                >
                  <img
                    src={screenshots[currentIndex]?.url}
                    alt={`Screenshot ${currentIndex + 1}`}
                    css={{
                      // Ensure arrows never overlap the image: reserve horizontal "gutters"
                      // on both sides where the controls can live.
                      maxWidth: `min(90vw, calc(100vw - ${MODAL_NAV_GUTTER_PX * 2}px))`,
                      maxHeight: '80vh',
                      objectFit: 'contain',
                      display: 'block',
                    }}
                  />
                </motion.div>

                {/* Thumbnail strip */}
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
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </>
  )
}
