# Contributing

First, thank you for considering contributing to **renoun**! Your contributions help make renoun better for everyone.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How to Contribute](#how-to-contribute)
  - [Reporting Issues](#reporting-issues)
  - [Suggesting Enhancements](#suggesting-enhancements)
  - [Submitting Pull Requests](#submitting-pull-requests)
- [License](#license)
- [Getting Help](#getting-help)
- [Benchmarking](#benchmarking)
- [Debugging](#debugging)

---

## Code of Conduct

Please note that this project is released with a [Contributor Code of Conduct](CODE_OF_CONDUCT.md). By participating in this project you agree to abide by its terms.

## How to Contribute

### 1. Reporting Issues

If you encounter any bugs or have suggestions for improvements, please [open an issue](https://github.com/souporserious/renoun/issues) in the repository. When reporting a bug, please include:

- A clear and descriptive title.
- A detailed description of the problem.
- Steps to reproduce the issue.
- Any relevant screenshots or logs.

### 2. Suggesting Enhancements

Feature requests and enhancements are welcome and appreciated. To suggest an improvement:

- Open an issue in the repository.
- Provide a clear and descriptive title.
- Include a detailed description of the feature or enhancement.
- Explain why this feature would be beneficial.

### 3. Submitting Pull Requests

Contributions are welcome, to submit a pull request:

1. **Fork the Repository**: Click the "Fork" button at the top right of the [renoun repository](https://github.com/souporserious/renoun) to create your own fork.

2. **Clone Your Fork**:

```bash
git clone https://github.com/souporserious/renoun.git
```

3. **Create a Branch**:

```bash
git checkout -b feature/your-feature-name
```

4. **Make Your Changes**: Implement your feature or bug fix.

5. **Commit Your Changes**:

```bash
git commit -m "your feature description"
```

6. **Push to Your Fork**:

```bash
git push origin your-feature-name
```

7. **Open a Pull Request**: Navigate to the original [renoun repository](https://github.com/souporserious/renoun) and click the "Compare & pull request" button. Provide a clear description of your changes and submit the PR.

---

## License

Contributions are accepted under the project's [MIT license](/LICENSE.md). By submitting code, you confirm you have the right to do so and that your contribution will be licensed under MIT.

---

## Getting Help

If you need any assistance or have questions about contributing, feel free to reach out:

- **Discord**: [Join the server](https://discord.gg/7Mf4xEBYx9)
- **GitHub Discussions**: [Join the discussion](https://github.com/souporserious/renoun/discussions)

Thank you for your interest in contributing to renoun! Your support is greatly appreciated 🙏

---

## Benchmarking

To benchmark cold vs warm `@apps/site` build performance (including cache hit/miss stats), run:

```bash
pnpm bench:site
```

Useful options:

```bash
# one cold run + three warm runs, write machine-readable output
pnpm bench:site -- --warm-runs 3 --json tmp/site-benchmark.json

# focus on timing only (disable cache hit/miss parsing)
pnpm bench:site -- --no-cache-stats
```

The command clears cold-state cache paths before each cold run, then runs warm builds back-to-back and prints a summary delta.

---

## Debugging

You can enable internal debug logs to help diagnose issues while developing or testing renoun.

Set the `RENOUN_DEBUG` environment variable before running commands:

- Allowed values:
  - `true` or `1`: enable logging at the most verbose level
  - `error`, `warn`, `info`, `debug`, `trace`: set a specific minimum level
  - `false` or `0`: logging disabled (default)

Examples:

```bash
# Most verbose logging
RENOUN_DEBUG=true pnpm dev

# Info and above
RENOUN_DEBUG=info pnpm dev

# CLI example
RENOUN_DEBUG=debug renoun next dev
```
