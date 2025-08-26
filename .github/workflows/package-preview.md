## Package Preview Workflow

This workflow builds and publishes **preview npm packages** for pull requests, using **Turbo** to detect affected workspaces and a dedicated Git branch (`package-preview`) to host the tarballs via raw URLs. Writes to the preview branch are serialized to avoid cross-PR races.

### How it works

1. **Trigger** – Runs on `pull_request` events: opened, synchronized (new commits), reopened, and closed.
2. **Affected detection** – Uses `git diff` between the PR base and head plus the workspace graph to select publishable workspaces and their internal dependencies.
3. **Packaging** – Runs `pnpm pack` for each affected public workspace into a `previews/` directory. Tarballs are renamed to include the PR head short SHA (e.g. `pkg-a-1.2.3-<sha7>.tgz`) to make them uniquely cacheable.
4. **Branch update** – Pushes tarballs into the `package-preview` branch under a per-PR directory (e.g. `123/renoun-1.0.0.tgz`). The branch is force-pushed with a single commit to avoid history bloat.
5. **Sticky PR comment** – Uses `actions/github-script` to post or update a sticky PR comment with `npm install` commands using raw GitHub URLs to the tarballs. If no packages are affected, any existing sticky comment is removed.
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
- `.github/scripts/package-preview/cleanup.js` – Removes `<pr-number>/` from the `package-preview` branch on close and force-pushes.
- All scripts validate inputs and set a bot git identity before committing.

#### Optional: Root Directory placeholder

Some hosting providers expect a specific root directory to exist in every branch. If your preview branch only contains tarballs at the top level, those builds may fail. You can set `ROOT_DIRECTORY` (for example, `apps/site`) to have the workflow ensure that directory exists in the preview branch with a `.gitkeep` file.

Example:

```
env:
  ROOT_DIRECTORY: apps/site
```

### Example comment

````
### 📦 Preview packages

• **pkg-a-1.2.3-<sha7>.tgz**
```bash
npm install "https://raw.githubusercontent.com/owner/repo/package-preview/123/pkg-a-1.2.3-abc123.tgz"
````
