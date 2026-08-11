# Portfolio Knowledge Standard (OKF house profile)

A small, enforceable profile of Google's [Open Knowledge Format (OKF)](https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf)
for my portfolio repos. OKF represents a project's **knowledge** — domain concepts,
data models, components, decisions — as plain markdown files with YAML frontmatter
that live in git next to the code. This document is the house profile that the
validator (`bin/okf-validate.mjs`) enforces.

## Why

Each portfolio repo should be legible to a human reviewer **and** to an AI agent
without any special tooling: open the `knowledge/` directory, read the markdown.
The standard guarantees that knowledge is present, structured, and internally
consistent across every repo.

## The bundle

A bundle is the directory `knowledge/` at the repo root.

```
knowledge/
  index.md                 # reserved navigation file (NO frontmatter)
  log.md                   # optional, ISO-8601 dated changelog
  <category>/<concept>.md  # a concept: YAML frontmatter + markdown body
```

`<category>` is a free-form grouping (`domain/`, `components/`, `data/`,
`integrations/`, `infra/`, …). Keep the bundle lean; grow it as the project grows.

## Rules (what the validator checks)

This profile takes OKF v0.1 and tightens several "recommended" items to "required"
so conformance is meaningful. OKF compliance note: a strict OKF *consumer* must
tolerate the looser cases below; this profile is a stricter **authoring** gate for
my own repos, and any bundle that passes it is also a valid OKF bundle.

| # | Rule | OKF v0.1 | This profile |
|---|------|----------|--------------|
| 1 | `knowledge/` exists with ≥1 concept file | n/a | **required** |
| 2 | `knowledge/index.md` present, **no frontmatter** | optional | **required** |
| 3 | Concept frontmatter has non-empty `type` | required | required |
| 4 | Concept has `title`, `description`, `timestamp` | recommended | **required** |
| 5 | `timestamp` is valid ISO 8601 | recommended | **required** |
| 6 | Internal links (`/abs`, `./rel`) resolve | tolerated | **error if broken** |
| 7 | Concept filename is kebab-case (= concept id) | n/a | **required** |
| 8 | `log.md` headings are ISO-8601 dates (if present) | optional shape | checked if present |
| 9 | No orphan concepts — every concept reachable from `index.md` (BFS) | n/a | **required** |
| 10 | `index.md` stays ≤ 60 lines (routing, not payload) | n/a | **required** |
| 11 | Concept file stays ≤ 8 KB | n/a | **required** |
| 12 | Repo-root `CLAUDE.md` stays ≤ 60 lines (if present) | n/a | **required** |

## Relationship to ICM

Rules 9–12 borrow the "small, navigable, reachable" discipline of the
[Interpretable Context Methodology](https://github.com/RinDig/icm-architect): an
entry point should route rather than contain, individual context files should
stay small enough to read in one pass, and nothing should be left dangling and
unreferenced. That's the useful part, and it transfers cleanly to any repo.

What was deliberately **not** borrowed: numbered stage folders (`01_`, `02_`),
per-folder `CONTEXT.md` contracts, factory/product separation, human edit gates,
and `output/` directories. Those encode a sequential, human-in-the-loop pipeline
*workspace* — a place where stages hand off artifacts to a human before the next
stage runs. A Next.js app or a Go service is not that; its directory structure is
already dictated by its framework and build tooling. Layering ICM's pipeline
scaffolding on top would mean fighting the toolchain for no gain, so this profile
takes only the shape constraints (reachability, size caps) and leaves the
workflow scaffolding behind.

## Concept frontmatter

```yaml
---
type: Domain Entity          # required — free-form category string
title: Artifact              # required — human-readable name
description: One sentence.    # required — single-sentence summary
resource: https://…          # recommended — URI of the underlying asset, if any
tags: [domain, gear]         # recommended — cross-cutting labels
timestamp: 2026-06-15T00:00:00Z  # required — ISO 8601, last meaningful change
---
```

Body: standard markdown. Use OKF's conventional headings where they fit —
`# Schema` (fields/columns), `# Examples` (usage/code), `# Citations` (sources) —
and link related concepts with bundle-relative links: `[Build](/domain/build.md)`.

## Validate

```bash
# one repo
node bin/okf-validate.mjs ../rpg-build-optimizer

# all portfolio repos at once
npm run run-all
```

See [README.md](README.md) for CI wiring (the composite action).
