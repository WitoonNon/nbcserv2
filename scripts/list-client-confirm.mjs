#!/usr/bin/env node
/**
 * Lists every value in the codebase that is an assumption rather than a
 * confirmed client requirement.
 *
 * This is the single command that answers "what still needs an answer from
 * NBC Group?" — the guarantee behind the flexible-architecture promise.
 *
 *   npm run client-confirm
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOTS = ['src', 'prisma', 'docs'];
const EXTS = new Set(['.ts', '.tsx', '.prisma', '.md']);

/**
 * A marker is `@client-confirm` followed by one or more question codes such as
 * `B4`, `A1/A2/A3`, `B1–B6`, `C1, C2`. Requiring the code shape keeps prose
 * mentions of the convention itself out of the report.
 */
const CODE = String.raw`[A-Z]{1,2}\d+`;
const MARKER = new RegExp(
  String.raw`@client-confirm\s+(${CODE}(?:\s*[/,–—-]\s*(?:${CODE}|\d+))*)\s*[—:-]?\s*(.*)`,
);

async function* walk(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === 'generated' || e.name === '.next') continue;
      yield* walk(full);
    } else if (EXTS.has(path.extname(e.name))) {
      yield full;
    }
  }
}

const hits = [];
for (const root of ROOTS) {
  for await (const file of walk(root)) {
    const text = await readFile(file, 'utf8');
    text.split(/\r?\n/).forEach((line, i) => {
      const m = line.match(MARKER);
      if (m) {
        hits.push({
          file: file.replace(/\\/g, '/'),
          line: i + 1,
          question: m[1].replace(/\s+/g, '').replace(/[.,)]+$/, ''),
          note: (m[2] || '')
            .replace(/\*\/\s*$/, '')
            .replace(/^['"]?[,;]?\s*/, '')
            .replace(/['"],?\s*$/, '')
            .trim(),
        });
      }
    });
  }
}

if (hits.length === 0) {
  console.log('No open assumptions found.');
  process.exit(0);
}

const byQuestion = new Map();
for (const h of hits) {
  const key = h.question || '?';
  if (!byQuestion.has(key)) byQuestion.set(key, []);
  byQuestion.get(key).push(h);
}

const sorted = [...byQuestion.entries()].sort((a, b) => a[0].localeCompare(b[0], 'en', { numeric: true }));

console.log(`\nOpen client questions: ${sorted.length}  (${hits.length} code references)\n`);
for (const [question, items] of sorted) {
  const note = items.find((i) => i.note)?.note ?? '';
  console.log(`  ${question.padEnd(8)} ${note}`);
  for (const i of items) {
    console.log(`           ${i.file}:${i.line}`);
  }
  console.log();
}
console.log('See docs/02-CLIENT-DATA-CHECKLIST.md for the full questionnaire.\n');
