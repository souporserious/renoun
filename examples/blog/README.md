# Blog

This example demonstrates running the `@renoun/blog` application using the `renoun` CLI. Only a `package.json` and local content are required. The blog itself ships from the installed application while your files override what you need.

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
applies the `posts/` directory from this example as overrides. Any edits you make locally take effect
immediately thanks to the links created by the CLI.

## Overridden files

- `posts/` – Your content that overrides the template's defaults.

Add additional files to override more parts of the template, such as `ui/RootProvider.tsx` to change
the theme or `app/page.tsx` to customize layouts.
