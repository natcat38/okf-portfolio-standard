# Public repo audit, October 2026: findings and outcomes

A read-only audit of the public `main` on 2026-10-22 raised the findings below.
Each was rechecked against `main` on 2026-11-09 and closed in this repo.

| ID | Finding | Outcome |
|---|---|---|
| P1-1 | Consumers pinned the validator three ways: three floated on `@v1`, f1 pinned a commit labelled `# v1`, trip-planner pinned the old v1.2.0 tag object and missed rule 14. | Owner decision (2026-11-09): every consumer pins the full commit SHA of a release with a `# vX.Y.Z` comment; tags are never moved. Policy written into the README. v1.4.0 is the first release under it; each consumer's bump PR is linked from its own audit record. |
| P1-2 | README listed 3 consumers; 5 use the action. `run-all` missed task-router; README said "all three". | Fixed: README lists all five with links; `run-all` in `package.json` and `run-all.ps1` includes `../task-router`. |
| P1-3 | The validator passed `timestamp: 2026-02-31`, unclosed quotes, unclosed `[` lists, duplicate keys, `title: null`, and `>` block scalars. | Fixed in `bin/okf-validate.mjs`: the calendar date must survive a round trip; the frontmatter parser reports unclosed quotes and lists, duplicate keys, block scalars, unquoted `: ` and unreadable lines; YAML nulls count as missing. One bad-fixture line per case in `tests/fixtures/bad/knowledge/domain/malformed.md`. |
| P2-4 | Link checks were case-insensitive on Windows and macOS, so a local run could pass what Linux CI fails. | Fixed: `existsExact` compares each path segment with its directory listing. Bad fixture links `./domain/Orphan.md` where only `orphan.md` exists. |
| P2-5 | Links inside code were checked; `%20` and `x(1).md` targets broke; a `.md` link to a directory passed. | Fixed: fenced and inline code are skipped, targets are URL-decoded, one level of balanced parentheses is kept, and a `.md` target must be a file. Good fixture covers the first three. |
| P2-6 | STANDARD.md called rule 13 a "coverage gate"; the check only flags blank Purpose cells. | Fixed: STANDARD.md now says what the check reads and what it does not compare. |
| P2-7 | README opened in the owner's voice and never said what a bundle is for. | Fixed: README opens with a plain description and an example tree. |
| P2-8 | `npm run selftest` ran 1 of the 4 CI fixtures. | Fixed: `tests/run.mjs` runs all four with expected exit codes and checks that the bad fixture names every expected error; CI and `npm run selftest` both call it. |
| P2-9 | Merged branch `feat/icm-rules-9-12` left behind; no protection on `main`. | Fixed: branch deleted; the house `main` ruleset (PR required, linear history, required `test` check, no force-push or deletion) is active, verified 2026-11-09. |

Before release, v1.4.0 was run against the current `main` of all five
consumers: every bundle conforms.
