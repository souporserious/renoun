# Blog

This example demonstrates running the `@renoun/blog` application using the `renoun` CLI. Only a `package.json` and local content are required. The blog itself ships from the installed application while your files layer on top to customize what you need.

## Getting started

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Start the development server:

   ```bash
   pnpm dev
   ```

The `renoun dev` script copies the blog template from `node_modules` into a temporary runtime and
layers the `posts/` directory from this example on top. Any edits you make locally take effect
immediately thanks to the links created by the CLI.

## Layered files

- `posts/` – Your content layered on top of the template.

Add additional files to layer more parts of the template, such as `ui/RootProvider.tsx` to change
the theme or `app/page.tsx` to customize layouts.
