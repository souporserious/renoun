# Workbench

This example demonstrates running the `@renoun/workbench` application using the `renoun` CLI. Only a `package.json` and local content are required. The workbench ships from the installed template while your files override what you need.

## Template source

- [`apps/workbench`](../../apps/workbench)

## Getting started

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Start the development server:

   ```bash
   pnpm dev
   ```

The `renoun dev` script copies the workbench template into a temporary runtime and applies files from this example as overrides. Any local edits take effect immediately through links created by the CLI.

## Overridden files

- `components/` - Component source files, examples, and docs.
- `hooks/` - Hook implementations and exports.
- `ui/` - UI overrides for entry layouts and navigation.
