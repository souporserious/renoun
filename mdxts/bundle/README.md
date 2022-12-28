# mdxts/bundle

Compiles TypeScript and MDX files into routes and executable code for the browser. Features type inference, colocated examples, and meta information.

## Usage

```js
import { bundle } from 'mdxts/bundle'

const tsxString = `
export const HelloWorld = ({ name = 'World' }) => <div>Hello {name}</div>
`

const mdxString = `# Hello World`

const json = bundle({
  'hello-world.tsx': tsxString,
  'hello-world.mdx': mdxString,
})
```
