import 'server-only'

import type { createSource, mergeSources, SourceTreeItem } from '../index'

/** Renders a navigation tree from `createSource` or `mergeSources`. */
export async function Navigation({
  source,
  renderList,
  renderItem,
}: {
  /** A collection of sources returned from `createSource` or `mergeSources`. */
  source: ReturnType<typeof createSource> | ReturnType<typeof mergeSources>

  /** A function that renders a list of navigation items. */
  renderList: (list: { children: JSX.Element[]; depth: number }) => JSX.Element

  /** A function that renders a navigation item. */
  renderItem: (item: SourceTreeItem & { children?: JSX.Element }) => JSX.Element
}) {
  const tree = await source.tree()

  function buildNavigationTree(children: any[], depth: number): JSX.Element {
    return renderList({
      children: children.map((item) =>
        renderItem({
          ...item,
          children: item.children.length
            ? buildNavigationTree(item.children, depth + 1)
            : undefined,
        })
      ),
      depth,
    })
  }

  return buildNavigationTree(tree, 0)
}
