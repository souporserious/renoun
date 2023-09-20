import {
  addCodeMetaProps,
  type AddCodeMetaPropsOptions,
} from './add-code-meta-props'

export function rehypePlugin({
  onJavaScriptCodeBlock,
}: AddCodeMetaPropsOptions = {}) {
  return async function (tree, file) {
    await addCodeMetaProps({ onJavaScriptCodeBlock })(tree, file)
  }
}
