// import { addCodeMetaProps } from './add-code-meta-props'

export function rehypePlugin({ project }) {
  return function transformer(tree, file) {
    // await addCodeMetaProps(project)(tree, file)
    // await transformSymbolicLinks(tree)
    // console.log(project.getSourceFiles().map((file) => file.getBaseName()))
  }
}
