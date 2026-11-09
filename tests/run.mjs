#!/usr/bin/env node
// Self-test: runs the validator on every fixture and checks the outcome.
// `npm run selftest` and CI both call this file, so a local run proves
// exactly what CI proves. Bad fixtures must fail AND name each expected error,
// so a rule that silently stops firing is caught even while others still fail.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const validator = path.join(root, 'bin', 'okf-validate.mjs');

// Bare knowledge/ dirs exercise bundle rules alone; repo-root fixtures are the
// only way to exercise rules 12 and 13 (CLAUDE.md, FILE-MAP.md).
const cases = [
  { fixture: 'tests/fixtures/good/knowledge', pass: true },
  {
    fixture: 'tests/fixtures/bad/knowledge',
    pass: false,
    expect: [
      'filename must be kebab-case',
      'timestamp is not valid ISO 8601: "last Tuesday"',
      'timestamp is not valid ISO 8601: "2026-02-31"',
      'title: quoted value is not closed',
      'duplicate key: resource',
      'tags: inline list is not closed with ]',
      'summary: unquoted value contains ": "',
      'notes: block scalars',
      'malformed.md: frontmatter missing required field: description',
      'reserved file must NOT contain YAML frontmatter',
      'broken internal link: /domain/ghost.md',
      'broken internal link: ./domain/Orphan.md',
      'orphan concept',
    ],
  },
  { fixture: 'tests/fixtures/repo-good', pass: true },
  { fixture: 'tests/fixtures/repo-bad', pass: false },
];

let failed = 0;
for (const c of cases) {
  const r = spawnSync(process.execPath, [validator, c.fixture], { cwd: root, encoding: 'utf8' });
  const out = `${r.stdout}${r.stderr}`;
  const problems = [];
  if ((r.status === 0) !== c.pass) problems.push(`expected ${c.pass ? 'pass' : 'fail'}, got exit ${r.status}`);
  for (const e of c.expect ?? []) if (!out.includes(e)) problems.push(`missing error: ${e}`);
  if (problems.length) {
    failed++;
    console.log(`✗ ${c.fixture}\n${problems.map((p) => `    ${p}`).join('\n')}\n${out}`);
  } else {
    console.log(`✓ ${c.fixture} ${c.pass ? 'passes' : 'fails'} as expected`);
  }
}
process.exit(failed ? 1 : 0);
