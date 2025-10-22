# renoun waku blog example

This repository is an example built with [Waku](https://waku.gg/) and [renoun](https://renoun.dev). It demonstrates how to create a modern, fast, and flexible blog or documentation site using MDX content, React (server) components, and TypeScript.

## Features

- **MDX-based content**: Write posts and pages in Markdown with embedded React components.
- **TypeScript support**: Type-safe codebase for better developer experience.
- **Custom collections**: Organize content with categories, tags, and custom metadata.
- **Modern React components**: Easily extend and customize your site UI.
- **Fast build & hot reload**: Powered by Waku for instant feedback during development.

## Getting Started

### Prerequisites

- Node 22 or newer
- [pnpm](https://pnpm.io/) (or npm/yarn)

### Installation

```bash
pnpm install
```

### Development

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser to view the site.

### Build for Production

> **Note:** The `waku build` command currently produces an error at the end of the build process due to a known issue.
> This has been fixed (see [PR #1725](https://github.com/wakujs/waku/pull/1725)), but the fix is not yet released.
> The generated site in `dist/` is still usable, but you may see an error message after building.

```bash
pnpm build
```

The static site will be generated in the `dist/` and the static files are located in the `dist/public` folder.

### Local preview

After building the static site, you can preview the final output locally:

```bash
pnpm preview
```

This command starts a simple HTTP server (using `serve-handler`) to serve the generated HTML files from the `dist/public` folder.

- The static site will be available at [http://localhost:3000](http://localhost:3000) by default.
- If you want to use a different port, you can change it in `src/localserver.ts`.

## Folder Structure

```
├── content/
│   └── posts/                # Blog posts in MDX format
├── public/                   # Static assets (images, robots.txt, etc.)
├── src/
│   ├── components/           # React UI components
│   ├── pages/                # Page routes and layouts
│   ├── collections.ts        # Content collections and metadata
│   ├── mdx-components.tsx    # Custom MDX component mapping
│   └── styles.css            # Global styles ( based on shadcn/ui )
├── waku.config.ts            # Waku configuration
```
