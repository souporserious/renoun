import { addCodeMetaProps } from './add-code-meta-props'

export function rehypePlugin() {
  return async function (tree, file) {
    await addCodeMetaProps()(tree, file)
  }
}
