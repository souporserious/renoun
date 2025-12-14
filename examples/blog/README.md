# Blog

This example demonstrates running the `@renoun/blog` application using the `renoun` CLI. Only a `package.json` and local content are required. The blog itself ships from the installed application while your files shadow anything you want to override.

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
replaces the template `posts/` directory with the version stored in this example. Any edits you make
locally take effect immediately thanks to the symlinks created by the CLI.

## Shadowed files

- `posts/` – Replaces the template posts so you can publish your own content.

Add additional files to shadow more parts of the template, such as `ui/RootProvider.tsx` to change
the theme or `app/page.tsx` to customize layouts.
