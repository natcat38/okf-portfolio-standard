# okf-portfolio-standard

A tiny, vendor-neutral standard + validator that keeps the **knowledge bundles**
across my portfolio repos consistent and machine-readable. It's a stricter
**authoring profile** of Google's
[Open Knowledge Format (OKF)](https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf):
each repo carries a `knowledge/` directory of markdown-plus-YAML concept files,
and this repo is the single source of truth for the rules and the check.

- **The standard:** [`STANDARD.md`](STANDARD.md)
- **The validator:** [`bin/okf-validate.mjs`](bin/okf-validate.mjs) — zero-dependency Node
- **The CI hook:** [`action.yml`](action.yml) — a composite GitHub Action

## Validate locally

```bash
node bin/okf-validate.mjs ../rpg-build-optimizer   # one repo
npm run run-all                                    # all three at once
```

The validator accepts a repo root (it finds `knowledge/` inside) or a `knowledge/`
dir directly, and exits non-zero on any violation.

## Validate in CI (per repo)

Each portfolio repo adds one workflow that calls this repo's composite action — so
local runs and CI use the exact same validator with no copy-drift:

```yaml
# .github/workflows/okf.yml in a portfolio repo
name: OKF
on: [push, pull_request]
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - uses: natcat38/okf-portfolio-standard@v1
        with:
          path: .
```

## Consumers

- `rpg-build-optimizer`
- `f1-race-tracker`
- `trip-planner`

## License

MIT
