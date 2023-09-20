import title from 'title'
import type { Module } from '../index'

type Node = Module & {
  part: string
  pathSegments: string[]
  children: Node[]
  isDirectory: boolean
}

function markDirectories(node: Node): void {
  if (node.children.length > 0) {
    node.isDirectory = true
    node.title = title(node.part)
    node.children.forEach(markDirectories)
    delete node.headings
  } else {
    node.isDirectory = false
  }
}

function createTreeFromModules(allModules: Record<string, any>): Node[] {
  const root: Node[] = []

  for (let path in allModules) {
    const module = allModules[path]
    const parts = path.split('/')
    let pathSegments: string[] = []

    let currentNode: Node[] = root

    for (let index = 0; index < parts.length; index++) {
      const part = parts[index]

      pathSegments.push(part)

      let existingNode = currentNode.find((node) => node.part === part)

      if (existingNode) {
        currentNode = existingNode.children
      } else {
        const newNode: Node = {
          ...module,
          part,
          pathSegments,
          children: [],
        }
        currentNode.push(newNode)
        currentNode = newNode.children
      }
    }
  }

  return root[0].children
}

function renderNavigation(
  data: Record<string, any>,
  renderList: (list: { children: JSX.Element[]; order: number }) => JSX.Element,
  renderItem: (
    item: Omit<Node, 'children'> & { children?: JSX.Element }
  ) => JSX.Element
) {
  function buildNavigationTree(children: Node[], order: number) {
    return renderList({
      children: children.map((item) =>
        renderItem({
          ...item,
          children: item.children.length
            ? buildNavigationTree(item.children, order + 1)
            : null,
        })
      ),
      order,
    })
  }

  const tree = createTreeFromModules(data)
  tree.forEach(markDirectories)
  return buildNavigationTree(tree, 0)
}

/** Renders a navigation tree from a collection of modules. */
export function Navigation({
  data,
  renderList,
  renderItem,
}: {
  data: Record<string, any>
  renderList: (list: { children: JSX.Element[]; order: number }) => JSX.Element
  renderItem: (
    item: Omit<Node, 'children'> & { children?: JSX.Element }
  ) => JSX.Element
}) {
  return renderNavigation(data, renderList, renderItem)
}
