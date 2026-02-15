# Contributing to BIND Terminology Server

The BIND Terminology Server hosts the canonical code systems for the [BIND Standard](https://bind-standard.org). We welcome contributions from everyone in the insurance ecosystem — brokers, carriers, MGAs, TPAs, reinsurers, vendors, and developers.

## How to Contribute

1. **Fork** this repository
2. **Create a branch** for your change
3. **Make your changes** and commit them
4. **Open a pull request** against `main`

That's it. All contributions are reviewed before merging.

## What to Contribute

- **New code systems** — If a vocabulary is missing from the server, propose it. Follow the [code system shape](README.md#code-system-shape) and add the file to `codesystems/` and `_manifest.json`.
- **New concepts** — Adding codes to an existing code system? Add them to the `concept` array in the relevant JSON file.
- **Translations** — Add or improve `designation` entries for locale support (e.g. `fr-CA`).
- **Bug fixes** — Typos in display values, incorrect definitions, duplicate codes.
- **Server improvements** — API enhancements, performance, or developer experience.

## Adding a Code System

1. Create a new JSON file in `codesystems/` following the structure in the README
2. Add the filename to `codesystems/_manifest.json` (keep it sorted alphabetically)
3. Run `pnpm run validate` to verify the file passes all checks
4. Open a PR with a description of what the code system covers and why it's needed

## Guidelines

- Keep PRs focused. One code system or one logical change per pull request.
- Include a clear description of *why* the change is needed, not just *what* changed.
- Follow existing naming conventions: kebab-case file names, kebab-case concept codes, PascalCase `name` fields.
- Every concept must have `code`, `display`, and `definition`. The `definition` should be a meaningful description, not just a repeat of `display`.
- Translations go in the `designation` array using BCP-47 language tags (e.g. `fr-CA`).

## Code Quality

This project uses [Biome](https://biomejs.dev/) for linting and formatting.

Before opening a PR, run:

```bash
pnpm run validate     # validate all code system JSON files
pnpm run check        # lint + format check (what CI runs)
pnpm run check:fix    # auto-fix all issues
pnpm run typecheck    # TypeScript type checking
```

## Questions or Ideas?

If you want to discuss something before opening a PR, reach out at **contact@bind-standard.org**.

## License

By contributing to this project, you agree that your contributions will be released under the [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/) license.
