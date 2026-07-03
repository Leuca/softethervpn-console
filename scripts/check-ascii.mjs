// Fails if any source file contains a non-ASCII character (byte > 0x7F).
// Keeps comments, strings and identifiers plain ASCII across the codebase.
// Run via `npm run lint:ascii`; part of `npm run lint`.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

const ROOTS = ['src', 'scripts'];
const ROOT_FILES = ['webpack.common.js', 'webpack.dev.js', 'webpack.prod.js', 'vitest.config.ts'];
const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.css', '.html']);
const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage', '.git']);

function walk(dir, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) {
        walk(join(dir, entry.name), out);
      }
    } else if (EXTENSIONS.has(extname(entry.name))) {
      out.push(join(dir, entry.name));
    }
  }
}

const files = [];
for (const root of ROOTS) {
  try {
    if (statSync(root).isDirectory()) {
      walk(root, files);
    }
  } catch {
    // root missing, skip
  }
}
for (const file of ROOT_FILES) {
  try {
    if (statSync(file).isFile()) {
      files.push(file);
    }
  } catch {
    // file missing, skip
  }
}

let violations = 0;
for (const file of files) {
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, index) => {
    for (let col = 0; col < line.length; col++) {
      if (line.codePointAt(col) > 0x7f) {
        console.error(`${file}:${index + 1}:${col + 1}  non-ASCII character ${JSON.stringify(line[col])}`);
        violations += 1;
        break; // one report per line is enough
      }
    }
  });
}

if (violations > 0) {
  console.error(`\nFound ${violations} non-ASCII line(s). Use ASCII characters only.`);
  process.exit(1);
}
console.log(`check-ascii: ${files.length} files clean.`);
