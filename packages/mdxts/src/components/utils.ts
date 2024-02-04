/** Get the closest scrollable viewport of a node. */
function getClosestViewport(node: HTMLElement) {
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
