/* A backtick inside a GLSL template literal silently ends the string, and the
   parse error that follows names a token from the middle of the shader ("Unexpected
   identifier 'floor'") rather than the comment that caused it. Cost three debugging
   rounds; costs nothing to check. */
import { readFileSync } from 'node:fs';

const files = process.argv.slice(2);
let bad = 0;

for (const file of files) {
  const src = readFileSync(file, 'utf8');
  // Every `/* glsl */` template literal in the file.
  const re = /\/\*\s*glsl\s*\*\/\s*`([\s\S]*?)`;/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const body = m[1];
    if (body.includes('`')) {
      const line = src.slice(0, m.index).split('\n').length;
      console.error(`${file}: backtick inside the glsl literal starting at line ${line}`);
      bad++;
    }
  }
  // A literal that never closed swallows the rest of the file.
  const opens = (src.match(/\/\*\s*glsl\s*\*\/\s*`/g) || []).length;
  const closes = (src.match(/\/\*\s*glsl\s*\*\/[\s\S]*?`;/g) || []).length;
  if (opens !== closes) {
    console.error(`${file}: ${opens} glsl literals opened but ${closes} closed`);
    bad++;
  }
}

if (bad) {
  console.error(`\n${bad} problem(s). A backtick in a GLSL comment ends the JS string.`);
  process.exit(1);
}
console.log(`glsl ok — ${files.length} file(s) checked`);
