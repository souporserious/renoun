import title from 'title'
import type { Module, loadModules } from '../index'

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

async function createTreeFromModules(
  allModules: Record<string, Promise<Module>>
): Promise<Node[]> {
  const root: Node[] = []
  const resolvedModules = await Promise.all(
    Object.entries(allModules).map(async ([path, modulePromise]) => ({
      path,
      module: await modulePromise,
    }))
  )

  for (const { path, module } of resolvedModules) {
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

async function renderNavigation(
  allModules: Record<string, Promise<Module>>,
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

  const tree = await createTreeFromModules(allModules)
  tree.forEach(markDirectories)
  return buildNavigationTree(tree, 0)
}

/** Renders a navigation tree from a collection of modules. */
export async function Navigation({
  data,
  baseDirectory,
  renderList,
  renderItem,
}: {
  data: ReturnType<typeof loadModules>
  baseDirectory?: string
  renderList: (list: { children: JSX.Element[]; order: number }) => JSX.Element
  renderItem: (
    item: Omit<Node, 'children'> & { children?: JSX.Element }
  ) => JSX.Element
}) {
  const allData = await data.all()
  const parsedData = baseDirectory
    ? Object.fromEntries(
        Object.entries(allData).map(([pathname, module]) => [
          pathname.replace(baseDirectory ? `${baseDirectory}/` : '', ''),
          module,
        ])
      )
    : allData
  return renderNavigation(parsedData, renderList, renderItem)
}
