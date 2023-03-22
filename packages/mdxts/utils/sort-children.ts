/** Recursively sort children by order property. */
export function sortChildren(children) {
  children.sort((a, b) => a.order - b.order)

  children.forEach((child) => {
    if (!child.children) return
    sortChildren(child.children)
  })
}
