/** Get the closest scrollable viewport of a node. */
function getClosestViewport(node: HTMLElement) {
  let scrollableNode: ParentNode | null = node

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

/** Keep an element in view in the closest scrollable viewport. */
export function keepElementInView(node: HTMLElement) {
  const viewport = getClosestViewportRect(node)
  const nodeRect = node.getBoundingClientRect()
  const styles = {
    width: nodeRect.width,
    height: nodeRect.height,
    top: nodeRect.top + viewport.top,
    bottom: nodeRect.bottom,
    left: nodeRect.left + viewport.left,
    right: nodeRect.right,
  }

  if (styles.top < viewport.top) {
    styles.top = viewport.top
  } else if (styles.top + styles.height > viewport.bottom) {
    styles.top = viewport.bottom - styles.height
  }

  if (styles.height > viewport.height) {
    styles.top = viewport.top
    styles.height = viewport.height
  }

  if (styles.left < viewport.left) {
    styles.left = viewport.left
  } else if (styles.left + styles.width > viewport.right) {
    styles.left = viewport.right - styles.width
  }

  if (styles.width > viewport.width) {
    styles.left = viewport.left
    styles.width = viewport.width
  }

  return styles
}
