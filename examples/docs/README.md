# Docs

This example demonstrates running the `@renoun/docs` application using the `renoun` CLI. Only a `package.json` and local content are required. The app itself ships from the installed template while your files override what you need.

## Template source

- [`apps/docs`](../../apps/docs)

## Getting started

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Start the development server:

   ```bash
   pnpm dev
   ```

The `renoun dev` script copies the docs template into a temporary runtime and applies files from this example as overrides. Any local edits take effect immediately through links created by the CLI.

## Overridden files

- `docs/` - Your MDX content that overrides the template defaults.
