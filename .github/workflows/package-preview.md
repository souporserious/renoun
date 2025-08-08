## Package Preview Workflow

This workflow builds and publishes **preview npm packages** for pull requests, using **Turbo** to detect affected workspaces and a dedicated Git branch (`package-preview`) to host the tarballs via raw URLs. Writes to the preview branch are serialized to avoid cross-PR races.

### How it works

1. **Trigger** – Runs on `pull_request` events: opened, synchronized (new commits), reopened, and closed.
2. **Affected detection** – Uses `pnpm` + Turbo to list publishable workspaces changed since the PR base.
3. **Packaging** – Runs `pnpm pack` for each affected public workspace into a `previews/` directory.
4. **Branch update** – Pushes tarballs into the `package-preview` branch under a per-PR directory (e.g. `123/renoun-1.0.0.tgz`). The branch is force-pushed with a single commit to avoid history bloat.
5. **Sticky PR comment** – Posts or updates a comment in the PR with `npm install` commands using raw GitHub URLs to the tarballs.
6. **Cleanup** – On PR close, removes that PR’s directory from the `package-preview` branch and force-pushes to keep a clean history.

### Requirements

- **Workflow permissions** set to **“Read and write”** in repo settings (Actions → General → Workflow permissions).
- **pnpm** and **Turbo** in your repo.
- GitHub token with permission to push to the `package-preview` branch.
- This repo must not rely on `pull_request` events from forks for publishing.
- Optional: add a branch protection rule for `package-preview` that allows force-pushes by GitHub Actions and restricts who can push.

### Files

- `.github/workflows/package-preview.yml` – Workflow definition.
- `.github/scripts/package-preview/create.js` – Detects affected packages, packs them, and force-pushes tarballs to the `package-preview` branch under `<pr-number>/`.
- `.github/scripts/package-preview/comment.js` – Updates or creates the sticky comment in the PR.
- `.github/scripts/package-preview/cleanup.js` – Removes `<pr-number>/` from the `package-preview` branch on close and force-pushes.
- All scripts validate inputs and set a bot git identity before committing.

### Example comment

````
### 📦 Preview packages

• **pkg-a-1.2.3.tgz**
```bash
npm install "https://raw.githubusercontent.com/owner/repo/package-preview/123/pkg-a-1.2.3.tgz"
````
