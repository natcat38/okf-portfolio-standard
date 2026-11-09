# okf-portfolio-standard

A project's domain knowledge (what an invoice is, how a race gap is computed)
usually lives in people's heads or is scattered through the code. OKF stores it
as small markdown files in a `knowledge/` folder, so a new engineer or an AI
agent can learn the project without crawling the source. This repo holds the
rules for those folders and a checker that enforces them in CI.

```
knowledge/
  index.md               # routing page: links to every concept, no frontmatter
  domain/invoice.md      # one concept: YAML frontmatter + a short explanation
  domain/money.md
  decisions/gst-rate.md
```

The rules are a stricter **authoring profile** of Google's
[Open Knowledge Format (OKF)](https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf).
Five portfolio repos use them, and this repo is the single source of truth for
the rules and the check.

- **The standard:** [`STANDARD.md`](STANDARD.md)
- **The validator:** [`bin/okf-validate.mjs`](bin/okf-validate.mjs) — zero-dependency Node
- **The CI hook:** [`action.yml`](action.yml) — a composite GitHub Action

Beyond the original OKF-derived checks, the validator also enforces that every
concept is reachable from `index.md` (no orphans), that `index.md` and any
repo-root `CLAUDE.md` stay short (routing, not payload), and that concept files
stay under a size budget — see rules 9-12 in `STANDARD.md`. Rules 9-13 borrow
the "small, navigable, reachable" discipline (and the generated `FILE-MAP.md`
index) from Jake Van Clief's
[Interpretable Context Methodology (ICM)](https://github.com/RinDig/icm-architect)
— see "Relationship to ICM" in `STANDARD.md` for what was adopted and what
wasn't.

## Validate locally

```bash
node bin/okf-validate.mjs ../rpg-build-optimizer   # one repo
npm run run-all                                    # every consumer at once
npm run selftest                                   # the validator's own fixtures
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
      - uses: natcat38/okf-portfolio-standard@<full commit SHA> # v1.4.0
        with:
          path: .
```

Consumers pin the **full commit SHA** of a release, with the version in a
comment. A rule change therefore reaches a repo only through a reviewed bump,
never by surprise. Each release gets its own `vX.Y.Z` tag; existing tags are
never moved.

## Adopting in a new repo

1. Copy `templates/` into the new repo as its `knowledge/` bundle starting point.
2. Add the `.github/workflows/okf.yml` snippet above (from "Validate in CI").
3. Run the validator locally: `node bin/okf-validate.mjs .`

## Consumers

- [`rpg-build-optimizer`](https://github.com/natcat38/rpg-build-optimizer)
- [`f1-race-tracker`](https://github.com/natcat38/f1-race-tracker)
- [`trip-planner`](https://github.com/natcat38/trip-planner)
- [`invoicely`](https://github.com/natcat38/invoicely)
- [`task-router`](https://github.com/natcat38/task-router)

## License

MIT
