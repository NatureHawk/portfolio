// Re-copies the five three.js files the browser actually loads into vendor/.
// See vendor/README.md for why they're committed rather than resolved out of
// node_modules at runtime.
//
//   npm install three@<version> && npm run vendor
//
// Verifies the copied modules' own imports afterwards, because the failure
// mode otherwise is silent here and a 404 in the browser: if a new version of
// GLTFLoader picks up another relative import, that file won't be in the list
// below and nothing complains until the page is open.

import { mkdir, copyFile, readFile, access } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const from = join(root, 'node_modules', 'three');
const to = join(root, 'vendor', 'three');

const FILES = [
  ['build/three.module.min.js', 'three.module.min.js'],
  ['build/three.core.min.js', 'three.core.min.js'],
  ['examples/jsm/loaders/GLTFLoader.js', 'addons/loaders/GLTFLoader.js'],
  ['examples/jsm/utils/BufferGeometryUtils.js', 'addons/utils/BufferGeometryUtils.js'],
  ['examples/jsm/utils/SkeletonUtils.js', 'addons/utils/SkeletonUtils.js'],
];

try {
  await access(from);
} catch {
  console.error('three is not installed. Run `npm install` first.');
  process.exit(1);
}

for (const [src, dest] of FILES) {
  const target = join(to, dest);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(join(from, src), target);
  console.log(`  ${dest}`);
}

// Every relative import in what we just copied must resolve to another copied
// file. Bare specifiers ('three') are the import map's job, so they're skipped.
let missing = 0;
for (const [, dest] of FILES) {
  const target = join(to, dest);
  const source = await readFile(target, 'utf8');
  const specifiers = [...source.matchAll(/from\s*["']([^"']+)["']/g)].map((m) => m[1]);
  for (const spec of new Set(specifiers)) {
    if (!spec.startsWith('.')) continue;
    try {
      await access(resolve(dirname(target), spec));
    } catch {
      console.error(`  MISSING: ${dest} imports ${spec}, which was not copied.`);
      missing++;
    }
  }
}

if (missing > 0) {
  console.error(`\n${missing} unresolved import(s). Add them to FILES in this script.`);
  process.exit(1);
}

const version = JSON.parse(await readFile(join(from, 'package.json'), 'utf8')).version;
console.log(`\nVendored three@${version}. All relative imports resolve.`);
