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
}

function seededRandom(seed: number) {
  const x = Math.sin(seed) * 10000
  return x - Math.floor(x)
}

// Fixed size for all screenshots - no variation
const CARD_WIDTH = 240
const CARD_HEIGHT = 160
const MODAL_NAV_GUTTER_PX = 112 // 3rem button + ~1.5rem gap + breathing room (each side)

function generateTransformForScreenshot(
  screenshotUrl: string,
  index: number,
  total: number
) {
  const hash = screenshotUrl
    .split('')
    .reduce((acc, char) => acc + char.charCodeAt(0), 0)
  const seed = hash + index * 1337

  // Subtle rotation, more for back cards
  const rotation = (seededRandom(seed) - 0.5) * 12
  // Slight horizontal offset for natural scatter
  const offsetX = (seededRandom(seed + 1) - 0.5) * 30
  // Stack going slightly up/back
  const offsetY = index * 8
  // Back cards slightly smaller (realistic perspective)
  const scale = 1 - index * 0.015

  return {
    x: offsetX,
    y: offsetY,
    rotate: rotation,
    scale,
    zIndex: total - index,
    opacity: Math.max(0.6, 1 - index * 0.1),
  }
}

export function ScreenshotStack({
  screenshots,
  onModalOpenChange,
  onRemove,
  codeBlockPlaceholder,
  variant = 'inline',
  openOnClick = false,
}: ScreenshotStackProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const cardRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const [containerRect, setContainerRect] = useState<DOMRect | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const [isFocusWithin, setIsFocusWithin] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [direction, setDirection] = useState(0) // -1 for left, 1 for right
  const [openingAnimation, setOpeningAnimation] = useState<{
    x: number
    y: number
  } | null>(null)
  const isDraggingRef = useRef(false)
  const [removing, setRemoving] = useState<{ url: string; dir: number } | null>(
    null
  )

  // Notify parent when modal state changes
  useEffect(() => {
    onModalOpenChange?.(isModalOpen)
  }, [isModalOpen, onModalOpenChange])

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
    setDirection(-1)
    setOpeningAnimation(null) // Clear so we use slide animation
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : screenshots.length - 1))
  }, [screenshots.length])

  const goToNext = useCallback(() => {
    setDirection(1)
    setOpeningAnimation(null) // Clear so we use slide animation
    setCurrentIndex((prev) => (prev < screenshots.length - 1 ? prev + 1 : 0))
  }, [screenshots.length])

  const goToIndex = useCallback(
    (index: number) => {
      setDirection(index > currentIndex ? 1 : -1)
      setOpeningAnimation(null) // Clear so we use slide animation
      setCurrentIndex(index)
    },
    [currentIndex]
  )

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
    return screenshots.map((item, i) =>
      generateTransformForScreenshot(item.url, i, screenshots.length)
    )
  }, [screenshots])

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
                {screenshots.map((item, index) => {
                  const transform = transforms[index]

                  // Only compute fly-in animation for the newest screenshot (index 0)
                  // and only if we have valid source rect data
                  const isNewest = index === 0
                  let initialX = 0
                  let initialY = -40
                  let initialScale = 0.8

                  if (isNewest && containerRect && item.sourceRect) {
                    const stackCenterX = containerRect.left + containerRect.width / 2
                    const stackCenterY = containerRect.top + containerRect.height / 2
                    const sourceCenterX =
                      item.sourceRect.left + item.sourceRect.width / 2
                    const sourceCenterY =
                      item.sourceRect.top + item.sourceRect.height / 2

                    initialX = sourceCenterX - stackCenterX
                    initialY = sourceCenterY - stackCenterY
                    initialScale = Math.min(
                      item.sourceRect.width / CARD_WIDTH,
                      item.sourceRect.height / CARD_HEIGHT,
                      1.5
                    )
                  }

                  // When hovered, align cards with slight vertical offset
                  const hoverY = index * 4
                  const hoverScale = 1 - index * 0.02

                  return (
                    <motion.div
                      key={item.url}
                      ref={(el) => {
                        if (el) cardRefs.current.set(index, el)
                        else cardRefs.current.delete(index)
                      }}
                      drag={index === 0 && !!onRemove && !removing ? 'x' : false}
                      dragElastic={0.35}
                      dragMomentum={false}
                      dragSnapToOrigin={index === 0 && !!onRemove && !removing}
                      whileDrag={{
                        scale: 1.02,
                      }}
                      onDragStart={() => {
                        isDraggingRef.current = true
                      }}
                      onDragEnd={(_, info) => {
                        // Let click events settle after drag ends
                        setTimeout(() => {
                          isDraggingRef.current = false
                        }, 0)

                        if (!onRemove) return
                        if (index !== 0) return
                        if (removing) return

                        const offsetX = info.offset.x
                        const velocityX = info.velocity.x
                        const shouldRemove =
                          Math.abs(offsetX) > 80 || Math.abs(velocityX) > 700

                        if (!shouldRemove) return

                        const dir =
                          offsetX !== 0 ? Math.sign(offsetX) : Math.sign(velocityX)
                        setRemoving({ url: item.url, dir: dir === 0 ? 1 : dir })
                      }}
                      initial={{
                        opacity: 0,
                        x: initialX,
                        y: initialY,
                        rotate: 0,
                        scale: initialScale,
                      }}
                      animate={{
                        opacity:
                          removing?.url === item.url
                            ? 0
                            : isHovered
                              ? 1
                              : transform.opacity,
                        x:
                          removing?.url === item.url
                            ? removing.dir * 280
                            : isHovered
                              ? 0
                              : transform.x,
                        y: isHovered ? hoverY : transform.y,
                        rotate:
                          removing?.url === item.url
                            ? removing.dir * 10
                            : isHovered
                              ? 0
                              : transform.rotate,
                        scale: isHovered ? hoverScale : transform.scale,
                      }}
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
                        zIndex: transform.zIndex,
                        touchAction: index === 0 && !!onRemove ? 'pan-y' : undefined,
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
                        fontSize: '1.5rem',
                        transition: 'background-color 150ms ease',
                        ':hover': {
                          backgroundColor: 'rgba(255, 255, 255, 0.2)',
                        },
                      }}
                    >
                      ‹
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        goToNext()
                      }}
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
                        fontSize: '1.5rem',
                        transition: 'background-color 150ms ease',
                        ':hover': {
                          backgroundColor: 'rgba(255, 255, 255, 0.2)',
                        },
                      }}
                    >
                      ›
                    </button>
                  </>
                )}

                {/* Image carousel */}
                <AnimatePresence mode="popLayout">
                  <motion.div
                    key={screenshots[currentIndex]?.url}
                    initial={
                      currentIndex === 0 && openingAnimation
                        ? {
                            scale: 0.2,
                            x: openingAnimation.x,
                            y: openingAnimation.y,
                            opacity: 1,
                          }
                        : { opacity: 0, x: direction * 80 }
                    }
                    animate={{
                      scale: 1,
                      x: 0,
                      y: 0,
                      opacity: 1,
                    }}
                    exit={
                      currentIndex === 0 && openingAnimation
                        ? {
                            scale: 0.2,
                            x: openingAnimation.x,
                            y: openingAnimation.y,
                            opacity: 0,
                          }
                        : { opacity: 0, x: direction * -80 }
                    }
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
                </AnimatePresence>

                {/* Thumbnail strip */}
                {screenshots.length > 1 && (
                  <div
                    css={{
                      position: 'absolute',
                      bottom: '1.5rem',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      display: 'flex',
                      gap: '0.5rem',
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
                            'opacity 150ms ease, border-color 150ms ease',
                          ':hover': {
                            opacity: 1,
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
                )}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </>
  )
}
