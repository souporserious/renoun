import 'server-only'

import type { createDataSource, mergeDataSources } from '../index'

/** Renders a navigation tree from a collection of modules. */
export async function Navigation({
  source,
  renderList,
  renderItem,
}: {
  /** A collection of source files returned from `createDataSource` or `mergeDataSources`. */
  source:
    | ReturnType<typeof createDataSource>
    | ReturnType<typeof mergeDataSources>

  /** A function that renders a list of navigation items. */
  renderList: (list: { children: JSX.Element[]; depth: number }) => JSX.Element

  /** A function that renders a navigation item. */
  renderItem: (item: { children?: JSX.Element }) => JSX.Element
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
