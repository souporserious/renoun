import * as React from 'react'
import type { Node } from 'ts-morph'

/** View the AST for a specific node and optionally select it. */
export function AbstractSyntaxTree({
  node,
  selectedNode,
  setSelectedNode,
  level = 0,
}: {
  node: Node
  selectedNode?: Node
  setSelectedNode?: (node: Node) => void
  level?: number
}) {
  const isSelected = node === selectedNode

  return (
    <ul
      style={{
        margin: 0,
        padding: level === 0 ? '1rem' : undefined,
        overflow: level === 0 ? 'auto' : undefined,
      }}
    >
      <li
        style={{
          padding: '0.25rem',
          backgroundColor: isSelected ? '#3178c6' : undefined,
        }}
        onClick={() => setSelectedNode?.(node)}
      >
        {node.getKindName()}
      </li>
      {node.getChildren().map((child, index) => {
        return (
          <li key={index} style={{ listStyle: 'none', paddingLeft: level * 8 }}>
            <AbstractSyntaxTree
              node={child}
              selectedNode={selectedNode}
              setSelectedNode={setSelectedNode}
              level={level + 1}
            />
          </li>
        )
      })}
    </ul>
  )
}

export function getAbstractSyntaxTreeFromNode(node: Node) {
  const kindName = node.getKindName()
  const children = node.getChildren().map(getAbstractSyntaxTreeFromNode)

  return {
    kindName,
    children,
  }
}
