// Re-copies the single unlazy bundle the browser loads into vendor/.
// Same reasoning as vendor-three.mjs and vendor-anime.mjs: no bundler here, so
// whatever a module specifier points at has to exist as a served file, and
// node_modules/ is gitignored.
//
//   npm install unlazy@<version> --save-dev && npm run vendor:unlazy
//
// `dist/unlazy.js` is deliberately the file taken rather than `dist/index.js`.
// index.js is a two-line re-export of `@unlazy/core`, which is a bare specifier
// this project has no way to resolve, and core itself then splits into three
// more relative chunks. `dist/unlazy.js` is the pre-bundled build of exactly
// the three functions used here — 4.3 KB, no imports left in it at all.
//
// The blurhash/thumbhash builds (`unlazy.with-hashing.js`) are NOT taken: they
// carry a decoder for placeholder hashes, and nothing here ships a hash. The
// placeholders in this project are either a real low-cost image or nothing.

import { mkdir, copyFile, readFile, access } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const from = join(root, 'node_modules', 'unlazy');
const to = join(root, 'vendor', 'unlazy');

const FILES = [['dist/unlazy.js', 'unlazy.js']];

try {
  await access(from);
} catch {
  console.error('unlazy is not installed. Run `npm install` first.');
  process.exit(1);
}

const { version } = JSON.parse(await readFile(join(from, 'package.json'), 'utf8'));

for (const [src, dest] of FILES) {
  const target = join(to, dest);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(join(from, src), target);
  console.log(`  ${dest}`);
}

// A bundle should have no imports left to resolve — neither relative ones nor
// bare specifiers. If a future version starts splitting this build, or starts
// importing `@unlazy/core` from it, this is where we find out rather than in
// the browser as a 404.
for (const [, dest] of FILES) {
  const source = await readFile(join(to, dest), 'utf8');
  const specifiers = [...source.matchAll(/from\s*["']([^"']+)["']/g)].map((m) => m[1]);
  if (specifiers.length) {
    console.error(`  MISSING: ${dest} still imports ${[...new Set(specifiers)].join(', ')}`);
    process.exit(1);
  }
}

console.log(`unlazy ${version} vendored.`);
