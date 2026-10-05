import { copyFile, mkdir, readdir, rm } from "node:fs/promises";

const output = new URL("../dist/", import.meta.url);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

// Explicit allowlist: private notes and repository files must never be uploaded.
for (const file of ["index.html", "styles.css", "script.js"]) {
  await copyFile(new URL(`../${file}`, import.meta.url), new URL(file, output));
}

// Explicit public assets only; never copy private notes or credentials.
await mkdir(new URL("guess-the-stt/", output), { recursive: true });
for (const name of ["index.html", "style.css", "app.js"]) {
  await copyFile(
    new URL(`../guess-the-stt/${name}`, import.meta.url),
    new URL(`guess-the-stt/${name}`, output),
  );
}
// Optimized page images only (.webp); raw generations in img-src/ are never published.
await mkdir(new URL("guess-the-stt/img/", output), { recursive: true });
for (const name of await readdir(new URL("../guess-the-stt/img/", import.meta.url))) {
  if (!name.endsWith(".webp") && name !== "og.jpg") continue;  // og.jpg: link-preview card
  await copyFile(
    new URL(`../guess-the-stt/img/${name}`, import.meta.url),
    new URL(`guess-the-stt/img/${name}`, output),
  );
}
// The demo moved from /guess-the-size to /guess-the-stt; keep shared links working.
await mkdir(new URL("guess-the-size/", output), { recursive: true });
await copyFile(new URL("../redirects/guess-the-size.html", import.meta.url), new URL("guess-the-size/index.html", output));
console.log("Built public site files in dist/");
