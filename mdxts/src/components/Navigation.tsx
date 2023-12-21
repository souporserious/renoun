import 'server-only'

import type { createDataSource } from '../index'

/** Renders a navigation tree from a collection of modules. */
export async function Navigation({
  source,
  renderList,
  renderItem,
}: {
  /** A collection of source files returned from `createDataSource`. */
  source: ReturnType<typeof createDataSource>

  /** A function that renders a list of navigation items. */
  renderList: (list: { children: JSX.Element[]; order: number }) => JSX.Element

  /** A function that renders a navigation item. */
  renderItem: (item: { children?: JSX.Element }) => JSX.Element
}) {
  const tree = await source.tree()

  function buildNavigationTree(children: any[], order: number): JSX.Element {
    return renderList({
      children: children.map((item) =>
        renderItem({
          ...item,
          children: item.children.length
            ? buildNavigationTree(item.children, order + 1)
            : undefined,
        })
      ),
      order,
    })
  }

  return buildNavigationTree(tree, 0)
}
