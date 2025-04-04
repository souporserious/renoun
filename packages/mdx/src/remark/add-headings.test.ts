import { describe, expect, test } from 'vitest'
import { compile } from '@mdx-js/mdx'

import addHeadings from './add-headings'

describe('addHeadings', () => {
  test('string heading', async () => {
    const result = await compile(`# Hello, world!`, {
      remarkPlugins: [addHeadings],
    })

    expect(String(result)).toMatchInlineSnapshot(`
      "import {jsx as _jsx} from "react/jsx-runtime";
      export const headings = [{
        id: "hello,-world!",
        level: 1,
        children: "Hello, world!",
        text: "Hello, world!"
      }];
      function _createMdxContent(props) {
        const _components = {
          h1: "h1",
          ...props.components
        };
        return _jsx(_components.h1, {
          id: "hello,-world!",
          children: "Hello, world!"
        });
      }
      export default function MDXContent(props = {}) {
        const {wrapper: MDXLayout} = props.components || ({});
        return MDXLayout ? _jsx(MDXLayout, {
          ...props,
          children: _jsx(_createMdxContent, {
            ...props
          })
        }) : _createMdxContent(props);
      }
      "
    `)
  })

  test('code heading', async () => {
    const result = await compile(`# Hello, \`world\`!`, {
      remarkPlugins: [addHeadings],
    })

    expect(String(result)).toMatchInlineSnapshot(`
      "import {Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs} from "react/jsx-runtime";
      export const headings = [{
        id: "hello,-world!",
        level: 1,
        children: _jsxs(_Fragment, {
          children: ["Hello, ", _jsx("code", {
            children: "world"
          }), "!"]
        }),
        text: "Hello, world!"
      }];
      function _createMdxContent(props) {
        const _components = {
          code: "code",
          h1: "h1",
          ...props.components
        };
        return _jsxs(_components.h1, {
          id: "hello,-world!",
          children: ["Hello, ", _jsx(_components.code, {
            children: "world"
          }), "!"]
        });
      }
      export default function MDXContent(props = {}) {
        const {wrapper: MDXLayout} = props.components || ({});
        return MDXLayout ? _jsx(MDXLayout, {
          ...props,
          children: _jsx(_createMdxContent, {
            ...props
          })
        }) : _createMdxContent(props);
      }
      "
    `)
  })

  test('link heading', async () => {
    const result = await compile(`# [Hello, world!](https://example.com)`, {
      remarkPlugins: [addHeadings],
    })

    expect(String(result)).toMatchInlineSnapshot(`
      "import {Fragment as _Fragment, jsx as _jsx} from "react/jsx-runtime";
      export const headings = [{
        id: "hello,-world!",
        level: 1,
        children: _jsx(_Fragment, {
          children: _jsx("a", {
            href: "https://example.com",
            children: "Hello, world!"
          })
        }),
        text: "Hello, world!"
      }];
      function _createMdxContent(props) {
        const _components = {
          a: "a",
          h1: "h1",
          ...props.components
        };
        return _jsx(_components.h1, {
          id: "hello,-world!",
          children: _jsx(_components.a, {
            href: "https://example.com",
            children: "Hello, world!"
          })
        });
      }
      export default function MDXContent(props = {}) {
        const {wrapper: MDXLayout} = props.components || ({});
        return MDXLayout ? _jsx(MDXLayout, {
          ...props,
          children: _jsx(_createMdxContent, {
            ...props
          })
        }) : _createMdxContent(props);
      }
      "
    `)
  })

  test('image heading', async () => {
    const result = await compile(
      `# ![Hello, world!](https://example.com/image.png)`,
      {
        remarkPlugins: [addHeadings],
      }
    )

    expect(String(result)).toMatchInlineSnapshot(`
      "import {Fragment as _Fragment, jsx as _jsx} from "react/jsx-runtime";
      export const headings = [{
        id: "hello,-world!",
        level: 1,
        children: _jsx(_Fragment, {
          children: _jsx("img", {
            src: "https://example.com/image.png",
            alt: "Hello, world!"
          })
        }),
        text: "Hello, world!"
      }];
      function _createMdxContent(props) {
        const _components = {
          h1: "h1",
          img: "img",
          ...props.components
        };
        return _jsx(_components.h1, {
          id: "hello,-world!",
          children: _jsx(_components.img, {
            src: "https://example.com/image.png",
            alt: "Hello, world!"
          })
        });
      }
      export default function MDXContent(props = {}) {
        const {wrapper: MDXLayout} = props.components || ({});
        return MDXLayout ? _jsx(MDXLayout, {
          ...props,
          children: _jsx(_createMdxContent, {
            ...props
          })
        }) : _createMdxContent(props);
      }
      "
    `)
  })
})
