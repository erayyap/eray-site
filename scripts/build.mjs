import { copyFile, mkdir, rm } from 'node:fs/promises';

const output = new URL('../dist/', import.meta.url);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

// Explicit allowlist: private notes and repository files must never be uploaded.
for (const file of ['index.html', 'styles.css', 'script.js']) {
  await copyFile(new URL(`../${file}`, import.meta.url), new URL(file, output));
}
console.log('Built public site files in dist/');
