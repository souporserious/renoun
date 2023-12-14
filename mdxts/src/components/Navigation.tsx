import title from 'title'
import 'server-only'

import type { Module, createDataSource } from '../index'

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
  }
}

function createTreeFromSourceFiles(
  sourceFiles: Record<string, Module>
): Node[] {
  const root: Node[] = []

  for (const [path, module] of Object.entries(sourceFiles)) {
    const parts = path.split('/')
    let pathSegments: string[] = []
    let currentNode: Node[] = root

    for (let index = 0; index < parts.length; index++) {
      const part = parts[index]

      /** Don't include the readme or index files in the navigation since they relate to the directory. */
      if (/(readme|index)$/i.test(part)) {
        break
      }

      pathSegments.push(part)

      let existingNode = currentNode.find((node) => node.part === part)

      if (existingNode) {
        currentNode = existingNode.children
      } else {
        const newNode: Node = {
          ...module,
          part,
          pathSegments,
          isDirectory: false,
          children: [],
        }
        currentNode.push(newNode)
        currentNode = newNode.children
      }
    }
  }

  if (root.length > 0) {
    return root
  }

  return []
}

function renderNavigation(
  allSourceFiles: Record<string, Module>,
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

  const tree = createTreeFromSourceFiles(allSourceFiles)
  tree.forEach(markDirectories)
  return buildNavigationTree(tree, 0)
}

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
  renderItem: (
    item: Omit<Node, 'children'> & { children?: JSX.Element }
  ) => JSX.Element
}) {
  const allSourceFiles = await source.all()
  return renderNavigation(allSourceFiles, renderList, renderItem)
}
