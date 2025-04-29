import type { CSSObject } from 'restyle'

/**
 * Get the closest scrollable viewport of a node.
 * @internal
 */
export function getClosestViewport(node: HTMLElement) {
  let scrollableNode: ParentNode | null = node.parentNode

  while (scrollableNode) {
    if (scrollableNode === document.body) {
      return document.body
    }
    const { overflow, overflowX, overflowY } = getComputedStyle(
      scrollableNode as HTMLElement
    )
    const canScroll = /(auto|scroll|hidden)/.test(
      overflow + overflowX + overflowY
    )
    if (canScroll) {
      return scrollableNode as HTMLElement
    }
    scrollableNode = scrollableNode.parentNode
  }

  return document.body
}

/**
 * Get the closest scrollable viewport rect of a node.
 * @internal
 */
function getClosestViewportRect(node: HTMLElement) {
  const viewport = getClosestViewport(node)
  const isViewportBody = viewport === document.body
  const rect = viewport.getBoundingClientRect()
  const width = isViewportBody ? window.innerWidth : rect.width
  const height = isViewportBody ? window.innerHeight : rect.height
  const top = isViewportBody ? window.scrollY : viewport.scrollTop
  const left = isViewportBody ? window.scrollX : viewport.scrollLeft
  return { width, height, top, left, bottom: top + height, right: left + width }
}

/**
 * Get the rect of an element including the scroll.
 * @internal
 */
function getRectWithScroll(
  node: HTMLElement,
  scrollX: number,
  scrollY: number
) {
  const rect = node.getBoundingClientRect()
  return {
    width: rect.width,
    height: rect.height,
    top: rect.top + scrollY,
    bottom: rect.bottom + scrollY,
    left: rect.left + scrollX,
    right: rect.right + scrollX,
  }
}

interface KeepElementInViewOptions {
  maxWidth?: number
  maxHeight?: number
}

/**
 * Adjust the element's position including potential flipping.
 * @internal
 */
export function keepElementInView(
  popoverNode: HTMLElement,
  anchorNode: HTMLElement
) {
  const viewportRect = getClosestViewportRect(popoverNode)
  const popoverRect = getRectWithScroll(
    popoverNode,
    viewportRect.left,
    viewportRect.top
  )
  const anchorRect = getRectWithScroll(
    anchorNode,
    viewportRect.left,
    viewportRect.top
  )
  const styles = {
    width: popoverRect.width,
    height: popoverRect.height,
    top: anchorRect.top - popoverRect.height,
    left: anchorRect.left,
  }

  if (styles.top < viewportRect.top) {
    styles.top = anchorRect.bottom
  } else if (styles.top + styles.height > viewportRect.bottom) {
    styles.top = viewportRect.bottom - styles.height
  }

  if (styles.top + styles.height > viewportRect.bottom) {
    styles.height = viewportRect.bottom - styles.top
  }

  if (styles.left < viewportRect.left) {
    styles.left = anchorRect.right
  } else if (styles.left + styles.width > viewportRect.right) {
    styles.left = viewportRect.right - styles.width
  }

  if (styles.left < viewportRect.left) {
    styles.left = viewportRect.left
  }

  if (styles.left + styles.width > viewportRect.right) {
    styles.width = viewportRect.right - styles.left
  }

  popoverNode.style.top = styles.top + 'px'
  popoverNode.style.left = styles.left + 'px'
  popoverNode.style.width = styles.width + 'px'
  popoverNode.style.height = styles.height + 'px'
}

/** @internal */
export type HighlightBlock = {
  start: number
  end: number
  height: number
}

/**
 * Parses a string of comma separated line ranges into an array of highlight blocks.
 * @internal
 */
export function getHighlights(ranges: string): HighlightBlock[] {
  return ranges.split(',').map((range) => {
    const [start, end] = range.split('-')
    const parsedStart = parseInt(start, 10) - 1
    const parsedEnd = end ? parseInt(end, 10) - 1 : parsedStart

    return {
      start: parsedStart,
      end: parsedEnd,
      height: parsedEnd - parsedStart + 1,
    }
  })
}

/**
 * Generates a CSS linear gradient to highlight the provided lines.
 * @internal
 */
export function generateHighlightedLinesGradient(highlightedLines: string) {
  const blocks = getHighlights(highlightedLines)
  let highlights = []
  let previousEnd = 0

  // Start with a dimmed section unless the first block starts at line 0
  if (blocks.length > 0 && blocks[0].start > 0) {
    highlights.push(`var(--h0) 0%`)
    highlights.push(`var(--h0) ${blocks[0].start}lh`)
  }

  blocks.forEach((block, index) => {
    const start = `${block.start}lh`
    const end = `${block.end + 1}lh`

    // Add the highlighted section
    highlights.push(`var(--h1) ${start}`)
    highlights.push(`var(--h1) ${end}`)

    // Add a dimmed section after the highlighted section if there's a gap to the next block
    const nextStart =
      index + 1 < blocks.length ? `${blocks[index + 1].start}lh` : `100%`
    if (end !== nextStart) {
      highlights.push(`var(--h0) ${end}`)
      highlights.push(`var(--h0) ${nextStart}`)
    }

    previousEnd = block.end + 1
  })

  // If the last highlighted block doesn't reach the end of the document, extend the dimming to 100%
  if (previousEnd < blocks[blocks.length - 1].end) {
    highlights.push(`var(--h0) ${previousEnd}lh`)
    highlights.push(`var(--h0) 100%`)
  }

  return `linear-gradient(to bottom, ${highlights.join(', ')})`
}

/**
 * Generates a CSS linear gradient mask to focus highlighted lines.
 * @internal
 */
export function generateFocusedLinesGradient(highlightedLines: string) {
  const blocks = getHighlights(highlightedLines)
  let maskPieces: string[] = []

  if (blocks.length > 0 && blocks[0].start > 0) {
    maskPieces.push(`var(--m0) ${blocks[0].start}lh`)
  }

  blocks.forEach((block, index) => {
    const start = `${block.start}lh`
    const end = `${block.end + 1}lh`

    maskPieces.push(`var(--m1) ${start}, var(--m1) ${end}`)

    const nextStart =
      index + 1 < blocks.length ? `${blocks[index + 1].start}lh` : `100%`
    if (end !== nextStart) {
      maskPieces.push(`var(--m0) ${end}, var(--m0) ${nextStart}`)
    }
  })

  // Ensure the mask ends with a solid section by adding a last stop at 100% if not already specified
  const lastEnd = `${blocks[blocks.length - 1].end + 1}lh`
  if (maskPieces[maskPieces.length - 1] !== `var(--m1) ${lastEnd}`) {
    maskPieces.push(`var(--m0) 100%`)
  }

  return `linear-gradient(to bottom, ${maskPieces.join(', ')})`
}

/**
 * Returns the CSS styles for the scroll container accounting for bottom padding.
 * @internal
 */
export function getScrollContainerStyles({
  paddingBottom,
  color,
}: {
  paddingBottom?: string
  color?: string
}) {
  return {
    overflowX: 'scroll',
    '::-webkit-scrollbar': {
      height: paddingBottom,
    },
    '::-webkit-scrollbar-thumb': {
      backgroundColor: 'rgba(0, 0, 0, 0)',
    },
    ':hover::-webkit-scrollbar-thumb': {
      backgroundColor: color,
    },
    '@supports (-webkit-touch-callout: none)': {
      paddingBottom,
    },
    '@-moz-document url-prefix()': {
      paddingBottom,
    },
  } satisfies CSSObject
}
