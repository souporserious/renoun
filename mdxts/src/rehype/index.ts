import { addCodeMetaProps } from './add-code-meta-props'

export function rehypePlugin() {
  return async function (tree) {
    await addCodeMetaProps()(tree)
  }
}
