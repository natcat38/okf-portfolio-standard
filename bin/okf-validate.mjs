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
//   - every concept needs non-empty `type`, `title`, `description`, `timestamp`
//   - `timestamp` must be valid ISO 8601
//   - internal links (`/abs` and `./rel`) must resolve
//   - concept filenames must be kebab-case

import fs from 'node:fs';
import path from 'node:path';

const RESERVED = new Set(['index.md', 'log.md']);

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

// Parse flat YAML frontmatter: `key: value`, inline `[a, b]`, and block lists.
function parseFrontmatter(fmLines) {
  const data = {};
  let curKey = null;
  for (const raw of fmLines) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    const listItem = raw.match(/^\s*-\s+(.*)$/);
    if (listItem && curKey) {
      if (!Array.isArray(data[curKey])) data[curKey] = [];
      data[curKey].push(stripQuotes(listItem[1]));
      continue;
    }
    const kv = raw.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (kv) {
      const key = kv[1];
      const val = kv[2].trim();
      curKey = key;
      if (val === '') data[key] = '';
      else if (val.startsWith('[') && val.endsWith(']')) {
        data[key] = val.slice(1, -1).split(',').map((s) => stripQuotes(s)).filter(Boolean);
      } else data[key] = stripQuotes(val);
    }
  }
  return data;
}

function isIso8601(v) {
  if (typeof v !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}([Tt ]\d{2}:\d{2}(:\d{2})?(\.\d+)?([Zz]|[+-]\d{2}:?\d{2})?)?$/.test(v)) {
    return false;
  }
  return !Number.isNaN(new Date(v).getTime());
}

function isKebab(name) {
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(name);
}

// Pull internal link targets out of markdown (skips external + anchor-only links).
function internalLinks(body) {
  const targets = [];
  const re = /\[[^\]]*\]\(([^)]+)\)/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    let target = m[1].trim().split(/\s+/)[0]; // drop optional `"title"`
    if (!target) continue;
    if (/^(https?:|mailto:|tel:|#)/i.test(target)) continue;
    target = target.split('#')[0]; // drop fragment
    if (target) targets.push(target);
  }
  return targets;
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
        const data = parseFrontmatter(fm.fmLines);
        for (const key of ['type', 'title', 'description', 'timestamp']) {
          const v = data[key];
          if (v === undefined || v === null || String(v).trim() === '') {
            add(rel(file), `frontmatter missing required field: ${key}`);
          }
        }
        if (data.timestamp && !isIso8601(String(data.timestamp))) {
          add(rel(file), `timestamp is not valid ISO 8601: "${data.timestamp}"`);
        }
      }
    }

    // link resolution (applies to every .md, including reserved)
    const body = fm.has && !fm.unterminated ? fm.body : text;
    for (const target of internalLinks(body)) {
      const resolved = target.startsWith('/')
        ? path.join(bundleDir, target.slice(1))
        : path.resolve(path.dirname(file), target);
      if (!fs.existsSync(resolved)) {
        add(rel(file), `broken internal link: ${target}`);
      }
    }
  }

  if (conceptCount === 0) add('.', 'bundle has no concept files (needs at least one)');

  return findings;
}

// ---------- entry ----------

function resolveBundle(p) {
  const abs = path.resolve(p);
  if (path.basename(abs) === 'knowledge' && isDir(abs)) return abs;
  const k = path.join(abs, 'knowledge');
  if (isDir(k)) return k;
  return null;
}

function main() {
  const inputs = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  if (inputs.length === 0) inputs.push('.');

  let total = 0;
  for (const input of inputs) {
    const bundle = resolveBundle(input);
    if (!bundle) {
      console.error(`✗ ${input}: no knowledge/ bundle found`);
      total++;
      continue;
    }
    const findings = validateBundle(bundle);
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
