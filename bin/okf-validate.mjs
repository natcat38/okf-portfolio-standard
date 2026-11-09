#!/usr/bin/env node
// okf-validate.mjs — validates OKF "house standard" knowledge bundles.
//
// Zero dependencies. Frontmatter in these bundles is flat (scalars + simple
// lists), so a small inline parser is enough and keeps this script copy-anywhere.
//
// Usage:
//   node okf-validate.mjs [path ...]
//
// Each path may be a repo root (containing a `knowledge/` dir) or a `knowledge/`
// dir directly. With no paths, the current directory is used. Exits non-zero if
// any bundle has an error.
//
// The house standard = OKF v0.1 with a few rules tightened (see STANDARD.md):
//   - a `knowledge/` bundle must exist and contain at least one concept file
//   - `knowledge/index.md` is required and must have NO frontmatter
//   - every concept needs non-empty `type`, `title`, `description`, `timestamp`,
//     `resource`, and `tags`
//   - `timestamp` must be valid ISO 8601
//   - internal links (`/abs` and `./rel`) must resolve
//   - concept filenames must be kebab-case
//   - every concept must be reachable from index.md (no orphans)
//   - index.md stays under a line cap; concept files stay under a byte cap
//   - repo-root CLAUDE.md (if present) stays under a line cap

import fs from 'node:fs';
import path from 'node:path';

const RESERVED = new Set(['index.md', 'log.md']);
const INDEX_MAX_LINES = 60;
const CONCEPT_MAX_BYTES = 8 * 1024;
const CLAUDE_MD_MAX_LINES = 60;

// ---------- small helpers ----------

function isDir(p) {
  try { return fs.statSync(p).isDirectory(); } catch { return false; }
}

function walkMarkdown(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkMarkdown(full));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) out.push(full);
  }
  return out;
}

function stripQuotes(s) {
  const t = s.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  return t;
}

// Split a document into its frontmatter block and body.
function splitFrontmatter(text) {
  const lines = text.split(/\r?\n/);
  if (lines[0]?.trim() !== '---') {
    return { has: false, fmLines: [], body: text, bodyOffset: 0 };
  }
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') { end = i; break; }
  }
  if (end === -1) return { has: true, unterminated: true, fmLines: [], body: '', bodyOffset: 0 };
  return {
    has: true,
    fmLines: lines.slice(1, end),
    body: lines.slice(end + 1).join('\n'),
    bodyOffset: end + 1,
  };
}

// YAML's null spellings. A required field set to one of these is not present.
const YAML_NULLS = new Set(['null', 'Null', 'NULL', '~']);

// Why a single scalar value is not the flat YAML this standard allows, or null.
// ponytail: a few targeted checks, not a YAML parser. Upgrade path: a real
// parser (e.g. `yaml`) if bundles ever need nested values.
function scalarProblem(val) {
  const q = val[0];
  if (q === '"' || q === "'") {
    return val.length < 2 || !val.endsWith(q) ? 'quoted value is not closed' : null;
  }
  if (/^[>|][-+0-9]*$/.test(val)) {
    return 'block scalars (> or |) are not supported; keep the value on one line';
  }
  if (/:\s/.test(val)) return 'unquoted value contains ": "; quote it';
  return null;
}

// Parse flat YAML frontmatter: `key: value`, inline `[a, b]`, and block lists.
// Returns the data plus a list of problems: anything this flat dialect cannot
// read is reported rather than silently kept as a string.
function parseFrontmatter(fmLines) {
  const data = {};
  const problems = [];
  let curKey = null;
  for (const raw of fmLines) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    const listItem = raw.match(/^\s*-\s+(.*)$/);
    if (listItem && curKey) {
      if (!Array.isArray(data[curKey])) data[curKey] = [];
      const item = listItem[1].trim();
      const bad = scalarProblem(item);
      if (bad) problems.push(`${curKey}: list item ${bad}`);
      data[curKey].push(stripQuotes(item));
      continue;
    }
    const kv = raw.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!kv) {
      problems.push(`unreadable line: "${raw.trim()}"`);
      continue;
    }
    const key = kv[1];
    const val = kv[2].trim();
    if (Object.hasOwn(data, key)) problems.push(`duplicate key: ${key}`);
    curKey = key;
    if (val === '' || YAML_NULLS.has(val)) data[key] = '';
    else if (val.startsWith('[')) {
      if (!val.endsWith(']')) {
        problems.push(`${key}: inline list is not closed with ]`);
        data[key] = val;
      } else {
        const items = val.slice(1, -1).split(',').map((x) => x.trim()).filter(Boolean);
        for (const item of items) {
          const bad = scalarProblem(item);
          if (bad) problems.push(`${key}: list item ${bad}`);
        }
        data[key] = items.map(stripQuotes);
      }
    } else {
      const bad = scalarProblem(val);
      if (bad) problems.push(`${key}: ${bad}`);
      data[key] = stripQuotes(val);
    }
  }
  return { data, problems };
}

function isIso8601(v) {
  if (typeof v !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}([Tt ]\d{2}:\d{2}(:\d{2})?(\.\d+)?([Zz]|[+-]\d{2}:?\d{2})?)?$/.test(v)) {
    return false;
  }
  // `new Date('2026-02-31')` rolls over to 3 March instead of failing, so the
  // calendar date is checked on its own: it must survive a round trip.
  const [y, m, d] = v.slice(0, 10).split('-').map(Number);
  const day = new Date(Date.UTC(y, m - 1, d));
  if (day.getUTCFullYear() !== y || day.getUTCMonth() !== m - 1 || day.getUTCDate() !== d) {
    return false;
  }
  return !Number.isNaN(new Date(v).getTime());
}

function isKebab(name) {
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(name);
}

// Line count that matches `wc -l` intuition: a single trailing newline ends the
// last line rather than starting an empty one.
function countLines(text) {
  const lines = text.split(/\r?\n/);
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines.length;
}

// Directories listed in a FILE-MAP.md table whose Purpose cell is empty.
// Rows look like: | `internal/ws` | 7 | ws is the fan-out hub. |
// The separator row (| --- | ---: | --- |) and the header are skipped.
function undocumentedDirs(text) {
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t.startsWith('|')) continue;
    const cells = t.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length < 3) continue;
    const dir = cells[0].replace(/`/g, '');
    if (!dir || /^-+:?$/.test(dir) || dir.toLowerCase() === 'directory') continue;
    if (!cells[cells.length - 1]) out.push(dir);
  }
  return out;
}

// Blank out fenced code blocks and inline code, so a concept can show link
// syntax as an example without it being checked as a real link.
function stripCode(body) {
  return body
    .replace(/^[ \t]*(```|~~~)[^\n]*\n[\s\S]*?^[ \t]*\1[^\n]*$/gm, '')
    .replace(/`[^`\n]*`/g, '');
}

// Pull internal link targets out of markdown (skips external + anchor-only links).
// A target may hold one level of balanced parentheses, e.g. `./x(1).md`, and is
// URL-decoded, so `./my%20file.md` resolves to `my file.md`.
function internalLinks(body) {
  const targets = [];
  const re = /\[[^\]]*\]\(((?:[^()]|\([^()]*\))+)\)/g;
  let m;
  const text = stripCode(body);
  while ((m = re.exec(text)) !== null) {
    let target = m[1].trim().split(/\s+/)[0]; // drop optional `"title"`
    if (!target) continue;
    if (/^(https?:|mailto:|tel:|#)/i.test(target)) continue;
    target = target.split('#')[0]; // drop fragment
    try { target = decodeURIComponent(target); } catch { /* keep it as written */ }
    if (target) targets.push(target);
  }
  return targets;
}

// existsSync is case-insensitive on Windows and macOS, so a link to `./A.md`
// passes locally while Linux CI fails on `a.md`. Check each path segment's
// exact spelling against its directory listing, up to `stopAt`.
function existsExact(p, stopAt) {
  if (!fs.existsSync(p)) return false;
  let cur = path.resolve(p);
  const stop = path.resolve(stopAt);
  while (cur !== stop && path.dirname(cur) !== cur) {
    const dir = path.dirname(cur);
    let names;
    try { names = fs.readdirSync(dir); } catch { return true; }
    if (!names.includes(path.basename(cur))) return false;
    cur = dir;
  }
  return true;
}

// A link resolves when its target exists with the exact spelling; a `.md`
// link must also be a file, not a directory that happens to share the name.
function linkResolves(resolved, root) {
  if (!existsExact(resolved, root)) return false;
  if (resolved.toLowerCase().endsWith('.md')) return fs.statSync(resolved).isFile();
  return true;
}

// ---------- validation ----------

function validateBundle(bundleDir) {
  const findings = []; // { file, level, msg }
  const add = (file, msg, level = 'error') => findings.push({ file, level, msg });
  const rel = (f) => path.relative(bundleDir, f).split(path.sep).join('/');

  const indexPath = path.join(bundleDir, 'index.md');
  if (!fs.existsSync(indexPath)) add('index.md', 'required reserved file is missing');

  const files = walkMarkdown(bundleDir);
  let conceptCount = 0;

  for (const file of files) {
    const base = path.basename(file);
    const text = fs.readFileSync(file, 'utf8');
    const fm = splitFrontmatter(text);

    if (RESERVED.has(base)) {
      if (base === 'index.md' && fm.has) {
        add(rel(file), 'reserved file must NOT contain YAML frontmatter');
      }
      if (base === 'log.md') {
        for (const line of text.split(/\r?\n/)) {
          const h = line.match(/^#{1,6}\s+(\S+)/);
          if (h && /^\d{4}-\d{2}/.test(h[1]) && !isIso8601(h[1])) {
            add(rel(file), `log heading is not a valid ISO 8601 date: "${h[1]}"`);
          }
        }
      }
      // reserved files still get link-checked below
    } else {
      conceptCount++;
      const id = base.replace(/\.md$/i, '');
      if (!isKebab(id)) add(rel(file), `filename must be kebab-case (got "${base}")`);

      if (!fm.has) add(rel(file), 'missing YAML frontmatter (must open with ---)');
      else if (fm.unterminated) add(rel(file), 'frontmatter block is not closed with ---');
      else {
        const { data, problems } = parseFrontmatter(fm.fmLines);
        for (const p of problems) add(rel(file), `frontmatter ${p}`);
        for (const key of ['type', 'title', 'description', 'timestamp']) {
          const v = data[key];
          if (v === undefined || v === null || String(v).trim() === '') {
            add(rel(file), `frontmatter missing required field: ${key}`);
          }
        }
        if (data.timestamp && !isIso8601(String(data.timestamp))) {
          add(rel(file), `timestamp is not valid ISO 8601: "${data.timestamp}"`);
        }
        // Rule 14 — resource + tags, promoted from recommended after all three
        // consumer repos used both on 100% of concepts.
        for (const key of ['resource', 'tags']) {
          const v = data[key];
          if (v === undefined || v === null || String(v).trim() === '') {
            add(rel(file), `frontmatter missing required field: ${key}`);
          }
        }
      }
    }

    // link resolution (applies to every .md, including reserved)
    const body = fm.has && !fm.unterminated ? fm.body : text;
    for (const target of internalLinks(body)) {
      const resolved = target.startsWith('/')
        ? path.join(bundleDir, target.slice(1))
        : path.resolve(path.dirname(file), target);
      if (!linkResolves(resolved, path.dirname(bundleDir))) {
        add(rel(file), `broken internal link: ${target}`);
      }
    }
  }

  if (conceptCount === 0) add('.', 'bundle has no concept files (needs at least one)');

  // Rule 9 — no orphan concepts: every concept must be reachable from index.md via BFS.
  if (fs.existsSync(indexPath)) {
    const visited = new Set([indexPath]);
    const queue = [indexPath];
    while (queue.length) {
      const cur = queue.shift();
      let text;
      try { text = fs.readFileSync(cur, 'utf8'); } catch { continue; }
      const fm = splitFrontmatter(text);
      const body = fm.has && !fm.unterminated ? fm.body : text;
      for (const target of internalLinks(body)) {
        if (!target.toLowerCase().endsWith('.md')) continue;
        const resolved = target.startsWith('/')
          ? path.join(bundleDir, target.slice(1))
          : path.resolve(path.dirname(cur), target);
        if (linkResolves(resolved, path.dirname(bundleDir)) && !visited.has(resolved)) {
          visited.add(resolved);
          queue.push(resolved);
        }
      }
    }
    for (const file of files) {
      const base = path.basename(file);
      if (RESERVED.has(base)) continue;
      if (!visited.has(file)) {
        add(rel(file), 'orphan concept: not reachable from index.md');
      }
    }
  }

  // Rule 10 — index.md is routing, not payload: keep it short.
  if (fs.existsSync(indexPath)) {
    const indexLines = countLines(fs.readFileSync(indexPath, 'utf8'));
    if (indexLines > INDEX_MAX_LINES) {
      add('index.md', `index.md is ${indexLines} lines, exceeds ${INDEX_MAX_LINES}-line cap`);
    }
  }

  // Rule 11 — concept size budget.
  for (const file of files) {
    const base = path.basename(file);
    if (RESERVED.has(base)) continue;
    const size = fs.statSync(file).size;
    if (size > CONCEPT_MAX_BYTES) {
      add(rel(file), `concept file is ${size} bytes, exceeds ${CONCEPT_MAX_BYTES}-byte cap`);
    }
  }

  return findings;
}

// ---------- entry ----------

// Returns { bundleDir, repoRoot } where repoRoot is the repo root that contains
// `knowledge/`, or null when a bare `knowledge/` dir was handed in directly
// (repoRoot cannot be inferred in that case). Returns null if no bundle found.
function resolveBundle(p) {
  const abs = path.resolve(p);
  if (path.basename(abs) === 'knowledge' && isDir(abs)) return { bundleDir: abs, repoRoot: null };
  const k = path.join(abs, 'knowledge');
  if (isDir(k)) return { bundleDir: k, repoRoot: abs };
  return null;
}

function main() {
  const inputs = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  if (inputs.length === 0) inputs.push('.');

  let total = 0;
  for (const input of inputs) {
    const resolved = resolveBundle(input);
    if (!resolved) {
      console.error(`✗ ${input}: no knowledge/ bundle found`);
      total++;
      continue;
    }
    const { bundleDir: bundle, repoRoot } = resolved;
    const findings = validateBundle(bundle);

    // Rule 12 — entry file cap. Only checked when we were handed a repo root
    // (not a bare knowledge/ dir), and only if CLAUDE.md actually exists there.
    if (repoRoot) {
      const claudeMdPath = path.join(repoRoot, 'CLAUDE.md');
      if (fs.existsSync(claudeMdPath)) {
        const lines = countLines(fs.readFileSync(claudeMdPath, 'utf8'));
        if (lines > CLAUDE_MD_MAX_LINES) {
          findings.push({
            file: 'CLAUDE.md',
            level: 'error',
            msg: `CLAUDE.md is ${lines} lines, exceeds ${CLAUDE_MD_MAX_LINES}-line cap`,
          });
        }
      }
    }

    // Rule 13 — FILE-MAP.md: a generated directory index so an agent can orient
    // without crawling the tree. Every row must declare a purpose; a blank one
    // means a source directory nothing describes. Repo-root check, like rule 12.
    if (repoRoot) {
      const mapPath = path.join(repoRoot, 'FILE-MAP.md');
      if (!fs.existsSync(mapPath)) {
        findings.push({ file: 'FILE-MAP.md', level: 'error', msg: 'required file is missing' });
      } else {
        for (const dir of undocumentedDirs(fs.readFileSync(mapPath, 'utf8'))) {
          findings.push({
            file: 'FILE-MAP.md',
            level: 'error',
            msg: `source directory declares no purpose: ${dir}`,
          });
        }
      }
    }

    const errors = findings.filter((f) => f.level === 'error');
    const label = path.relative(process.cwd(), bundle).split(path.sep).join('/') || bundle;
    if (findings.length === 0) {
      console.log(`✓ ${label}: conforms`);
    } else {
      console.log(`${errors.length ? '✗' : '⚠'} ${label}:`);
      for (const f of findings) {
        console.log(`    [${f.level}] ${f.file}: ${f.msg}`);
      }
    }
    total += errors.length;
  }

  if (total > 0) {
    console.error(`\n${total} error(s) found.`);
    process.exit(1);
  }
  console.log('\nAll bundles conform.');
}

main();
