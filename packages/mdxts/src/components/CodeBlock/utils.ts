/** Get the closest scrollable viewport of a node. */
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

/** Get the closest scrollable viewport rect of a node. */
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

/** Get the rect of an element including the scroll. */
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

/** Adjust the element's position including potential flipping. */
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

  if (styles.left + styles.width > viewportRect.right) {
    styles.width = viewportRect.right - styles.left
  }

  return styles
}

export type HighlightBlock = {
  start: number
  end: number
  height: number
}

/** Parses a string of comma separated line ranges into an array of highlight blocks. */
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

/** Generates a CSS linear gradient mask to focus highlighted lines. */
export function generateFocusLinesMaskImage(highlightedLines: string) {
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
