import parseTitle from 'title'

type Node = {
  title: string
  part: string
  pathSegments: string[]
  children: Node[]
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
      let title

      pathSegments.push(part)

      if (index < parts.length - 1) {
        title = parseTitle(part)
      } else {
        title = module.title || parseTitle(part)
      }

      let existingNode = currentNode.find((node) => node.part === part)

      if (existingNode) {
        currentNode = existingNode.children
      } else {
        const newNode: Node = {
          part,
          title,
          pathSegments,
          children: [],
        }
        currentNode.push(newNode)
        currentNode = newNode.children
      }
    }
  }

  return root
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
        renderItem(
          Object.assign(item, {
            children: item.children.length
              ? buildNavigationTree(item.children, order + 1)
              : null,
          })
        )
      ),
      order,
    })
  }

  const tree = createTreeFromModules(data)
  return buildNavigationTree(tree[0].children, 0)
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
