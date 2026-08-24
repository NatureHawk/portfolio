// Encodes the product photography to WebP.
//
//   npm run images
//
// WHY THIS EXISTS. BRUSH's product shots shipped as PNG — eleven files, 11.6 MB
// between them, the largest 1.6 MB. PNG is lossless and it is the wrong format
// for a photograph: it cannot exploit the fact that nobody can see the
// difference between two adjacent near-black pixels, and every one of these is
// a lit object on a black ground, which is mostly exactly that. The same
// pictures as WebP are a fraction of the size with no visible change, and this
// is the single largest thing that was making /design slow to arrive.
//
// The explosion sequence was already WebP — only the stills were missed.
//
// LOSSLESS IS DELIBERATELY NOT USED for these. `nearLossless` was measured and
// lands around 40% of the PNG; quality 82 lands around 6% and is visually
// indistinguishable on a photograph at any size this site displays them. The
// one thing that IS preserved is the alpha channel, because several of these
// are cut out against transparency and are composited onto the world's own
// ground rather than onto their own background.
//
// The PNGs are kept. They are the masters, they are what this script reads,
// and the repo should still contain a lossless copy of anything it publishes a
// lossy version of. `.vercelignore` keeps them out of the deploy.

import { readdir, stat, access } from 'node:fs/promises';
import { dirname, join, resolve, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/* Two sets, two reasons.

   assets/*.png            BRUSH's product stills — lossless masters of dark
                           photographs, the worst possible case for PNG.
   assets/website3/*.jpeg  NEW FORMS' nine plates — already lossy, but JPEG,
                           and WebP at the same perceptual quality is roughly
                           a third the size. */
const SETS = [
  { dir: join(root, 'assets'), ext: ['.png'] },
  { dir: join(root, 'assets', 'website3'), ext: ['.jpeg', '.jpg'] },
];

const QUALITY = 82;
const force = process.argv.includes('--force');

const mb = (n) => `${(n / 1048576).toFixed(2)} MB`;

const files = [];
for (const set of SETS) {
  for (const name of await readdir(set.dir)) {
    if (set.ext.includes(extname(name).toLowerCase())) files.push(join(set.dir, name));
  }
}

let before = 0;
let after = 0;
let skipped = 0;

for (const from of files) {
  const file = basename(from);
  const to = join(dirname(from), `${basename(file, extname(file))}.webp`);

  const source = await stat(from);

  // Re-encoding an unchanged master on every run is a slow no-op, and it
  // rewrites files git would otherwise leave alone.
  if (!force) {
    try {
      const existing = await stat(to);
      if (existing.mtimeMs >= source.mtimeMs) {
        before += source.size;
        after += existing.size;
        skipped += 1;
        continue;
      }
    } catch { /* not encoded yet */ }
  }

  await sharp(from).webp({ quality: QUALITY, effort: 6 }).toFile(to);

  const out = await stat(to);
  before += source.size;
  after += out.size;
  console.log(
    `  ${file.padEnd(34)} ${mb(source.size).padStart(9)} → ${mb(out.size).padStart(9)}` +
      `  (${Math.round((1 - out.size / source.size) * 100)}% smaller)`
  );
}

console.log(
  `\n${files.length} images (${skipped} already current): ${mb(before)} → ${mb(after)}` +
    `  — ${mb(before - after)} saved.`
);
