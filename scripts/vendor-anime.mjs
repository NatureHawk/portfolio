// Re-copies the single anime.js bundle the browser loads into vendor/.
// Same reasoning as vendor-three.mjs and vendor/README.md: no bundler here, so
// whatever an import map or a module specifier points at has to exist as a
// served file, and node_modules/ is gitignored.
//
//   npm install animejs@<version> --save-dev && npm run vendor:anime
//
// The ESM bundle is deliberately the *bundled* one rather than the per-module
// tree (dist/modules/**): the modules directory is ~90 files of relative
// imports, which without a bundler is 90 serial-ish round trips. One 118 KB
// file (~40 KB compressed) is cheaper on any real connection.

import { mkdir, copyFile, readFile, access } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const from = join(root, 'node_modules', 'animejs');
const to = join(root, 'vendor', 'anime');

const FILES = [['dist/bundles/anime.esm.min.js', 'anime.esm.min.js']];

try {
  await access(from);
} catch {
  console.error('animejs is not installed. Run `npm install` first.');
  process.exit(1);
}

const { version } = JSON.parse(await readFile(join(from, 'package.json'), 'utf8'));

for (const [src, dest] of FILES) {
  const target = join(to, dest);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(join(from, src), target);
  console.log(`  ${dest}`);
}

// A bundle should have no imports left to resolve. If a future version starts
// splitting the ESM bundle, this is where we find out — rather than in the
// browser as a 404.
for (const [, dest] of FILES) {
  const source = await readFile(join(to, dest), 'utf8');
  const relative = [...source.matchAll(/from\s*["'](\.[^"']+)["']/g)].map((m) => m[1]);
  if (relative.length) {
    console.error(`  MISSING: ${dest} still imports ${[...new Set(relative)].join(', ')}`);
    process.exit(1);
  }
}

console.log(`anime.js ${version} vendored.`);
