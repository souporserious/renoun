import type { Link, PhrasingContent, Root } from 'mdast'
import { visit } from 'unist-util-visit'

const JSDOC_INLINE_PATTERN = /\{@([a-zA-Z]+)(?:\s+((?:[^{}]|\{[^{}]*\})*))?\}/g

type JSDocInlineTag =
  | 'link'
  | 'linkcode'
  | 'linkplain'
  | 'tutorial'
  | 'code'
  | 'literal'

const linkTags: JSDocInlineTag[] = ['link', 'linkplain', 'linkcode', 'tutorial']

function createLinkNode(
  target: string,
  label: string | undefined,
  isCodeLabel: boolean
): Link {
  const content = label?.trim() || target

  const child = isCodeLabel
    ? ({
        type: 'inlineCode',
        value: content,
      } as const)
    : ({
        type: 'text',
        value: content,
      } as const)

  return {
    type: 'link',
    url: target,
    title: null,
    children: [child],
  }
}

function replaceInlineTags(value: string): PhrasingContent[] | null {
  JSDOC_INLINE_PATTERN.lastIndex = 0

  let lastIndex = 0
  const nextNodes: PhrasingContent[] = []
  let match: RegExpExecArray | null

  while ((match = JSDOC_INLINE_PATTERN.exec(value)) !== null) {
    const [matchText, rawTag, rawBody] = match
    const tag = rawTag as JSDocInlineTag | string

    if (match.index > lastIndex) {
      nextNodes.push({
        type: 'text',
        value: value.slice(lastIndex, match.index),
      })
    }

    const isLinkTag = (linkTags as string[]).includes(tag)

    if (isLinkTag) {
      const body = (rawBody ?? '').trim()

      if (!body) {
        // No body → keep original text
        nextNodes.push({ type: 'text', value: matchText })
        lastIndex = match.index + matchText.length
        continue
      }

      let target: string
      let rawLabel: string | undefined

      const pipeIndex = body.indexOf('|')
      if (pipeIndex !== -1) {
        // TSDoc-style: {@link target|label}
        target = body.slice(0, pipeIndex).trim()
        rawLabel = body.slice(pipeIndex + 1)
      } else {
        // JSDoc-style: {@link target Label text here}
        const firstSpace = body.search(/\s/)
        if (firstSpace !== -1) {
          target = body.slice(0, firstSpace)
          rawLabel = body.slice(firstSpace + 1)
        } else {
          target = body
        }
      }

      if (target) {
        const isCodeLabel = tag === 'linkcode'
        nextNodes.push(createLinkNode(target, rawLabel, isCodeLabel))
      } else {
        // Couldn't parse a target → keep original text
        nextNodes.push({ type: 'text', value: matchText })
      }
    } else if (tag === 'code') {
      // {@code value} → inlineCode
      nextNodes.push({
        type: 'inlineCode',
        value: (rawBody ?? '').trim(),
      })
    } else if (tag === 'literal') {
      // {@literal <b>raw</b>} → keep body as-is (no trim)
      nextNodes.push({
        type: 'text',
        value: rawBody ?? '',
      })
    } else {
      // Unknown inline tag (including inheritdoc/inheritDoc) → keep literal
      nextNodes.push({ type: 'text', value: matchText })
    }

    lastIndex = match.index + matchText.length
  }

  if (!nextNodes.length) {
    return null
  }

  if (lastIndex < value.length) {
    nextNodes.push({
      type: 'text',
      value: value.slice(lastIndex),
    })
  }

  return nextNodes
}

export default function transformJSDocInlineTags() {
  return (tree: Root) => {
    visit(tree, (node) => {
      if (node.type !== 'heading' && node.type !== 'paragraph') {
        return
      }

      const updatedChildren: PhrasingContent[] = []

      for (let index = 0; index < node.children.length; index++) {
        const child = node.children[index] as PhrasingContent

        const isTextLike = child.type === 'text' || child.type === 'html'

        if (isTextLike) {
          const segment: PhrasingContent[] = [child]
          let hasTextNode = child.type === 'text'

          // Collect consecutive text/html siblings so we can
          // run the regex once across the combined string.
          while (index + 1 < node.children.length) {
            const next = node.children[index + 1] as PhrasingContent
            const nextIsTextLike = next.type === 'text' || next.type === 'html'

            if (!nextIsTextLike) break

            segment.push(next)
            hasTextNode = hasTextNode || next.type === 'text'
            index++
          }

          if (!hasTextNode) {
            // Only HTML children → don't touch, we’d lose structure.
            updatedChildren.push(...segment)
            continue
          }

          const combinedValue = segment
            .map((part) => ('value' in part ? String((part as any).value) : ''))
            .join('')

          const replacements = replaceInlineTags(combinedValue)

          if (replacements) {
            updatedChildren.push(...replacements)
          } else {
            updatedChildren.push(...segment)
          }
        } else {
          updatedChildren.push(child)
        }
      }

      node.children = updatedChildren
    })
  }
}
