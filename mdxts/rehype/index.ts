import {
  addCodeMetaProps,
  type AddCodeMetaPropsOptions,
} from './add-code-meta-props'

export function rehypePlugin({ onCodeBlock }: AddCodeMetaPropsOptions = {}) {
  return async function (tree, file) {
    await addCodeMetaProps({ onCodeBlock })(tree, file)
  }
}
