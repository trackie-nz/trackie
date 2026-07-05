/*
  Build manifest.json from a compiled client directory: a SHA-256 for every file,
  so the verifier can check what your browser was served against Trackie's public
  build. Run in CI right after the client is built (see release.yml).

  Usage: node generate-manifest.js <build-dir> <version> > manifest.json

  It hashes with the SAME sha256Hex the verifier uses, so the manifest and the
  check can never disagree about how a file is hashed.
*/
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { sha256Hex } from './verify-core.js';

const [, , buildDir, version] = process.argv;
if (!buildDir || !version) {
  console.error('usage: node generate-manifest.js <build-dir> <version>');
  process.exit(2);
}

/** Every file under dir, as paths relative to buildDir with forward slashes. */
function listFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listFiles(full));
    else out.push(relative(buildDir, full).split(sep).join('/'));
  }
  return out;
}

const files = {};
for (const path of listFiles(buildDir).sort()) {
  files[path] = await sha256Hex(readFileSync(join(buildDir, path)));
}

process.stdout.write(JSON.stringify({ version, files }, null, 2) + '\n');
