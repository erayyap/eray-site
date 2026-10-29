import { copyFile, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";

const output = new URL("../dist/", import.meta.url);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

// Explicit allowlist: private notes and repository files must never be uploaded.
for (const file of ["index.html", "styles.css", "script.js", "robots.txt", "sitemap.xml", "llms.txt"]) {
  await copyFile(new URL(`../${file}`, import.meta.url), new URL(file, output));
}

// Explicit public assets only; never copy private notes or credentials.
await mkdir(new URL("stt-demo/", output), { recursive: true });
for (const name of ["index.html", "style.css", "app.js"]) {
  await copyFile(
    new URL(`../stt-demo/${name}`, import.meta.url),
    new URL(`stt-demo/${name}`, output),
  );
}
// Optimized page images only (.webp); raw generations in img-src/ are never published.
await mkdir(new URL("stt-demo/img/", output), { recursive: true });
for (const name of await readdir(new URL("../stt-demo/img/", import.meta.url))) {
  if (!name.endsWith(".webp") && name !== "og.jpg") continue;  // og.jpg: link-preview card
  await copyFile(
    new URL(`../stt-demo/img/${name}`, import.meta.url),
    new URL(`stt-demo/img/${name}`, output),
  );
}
// The demo moved from /guess-the-size and /guess-the-stt to /stt-demo; keep shared links working.
for (const dir of ["guess-the-size", "guess-the-stt"]) {
  await mkdir(new URL(`${dir}/`, output), { recursive: true });
  await copyFile(new URL("../redirects/stt-demo.html", import.meta.url), new URL(`${dir}/index.html`, output));
}
// balbal-v2 launch page (/balbal), the archived balbal-v1 page (/balbal-v1) and the v1 technical post.
for (const dir of ["balbal", "balbal-v1", "balbal-blog"]) {
  await mkdir(new URL(`${dir}/`, output), { recursive: true });
  await copyFile(new URL(`../${dir}/index.html`, import.meta.url), new URL(`${dir}/index.html`, output));
}
await mkdir(new URL("balbal/img/", output), { recursive: true });
for (const name of await readdir(new URL("../balbal/img/", import.meta.url))) {
  if (!name.endsWith(".webp") && name !== "og.jpg") continue;
  await copyFile(new URL(`../balbal/img/${name}`, import.meta.url), new URL(`balbal/img/${name}`, output));
}
// balbal-v2 page art (.webp, intro and band videos .mp4/.webm) and link-preview card; raw generations in balbal/img-src-v2/ are never published.
await mkdir(new URL("balbal/v2/", output), { recursive: true });
for (const name of await readdir(new URL("../balbal/v2/", import.meta.url))) {
  if (!/\.(webp|mp4|webm)$/.test(name) && name !== "og.jpg") continue;
  await copyFile(new URL(`../balbal/v2/${name}`, import.meta.url), new URL(`balbal/v2/${name}`, output));
}
// Short links to the launch page (/balbal-v2 is the version link the citation uses).
for (const dir of ["asr", "stt", "balbal-v2"]) {
  await mkdir(new URL(`${dir}/`, output), { recursive: true });
  await copyFile(new URL("../redirects/balbal.html", import.meta.url), new URL(`${dir}/index.html`, output));
}
// IndexNow ownership key (Bing, Yandex, ...): served as /<key>.txt
const indexnowKey = (await readFile(new URL("../indexnow-key.txt", import.meta.url), "utf8")).trim();
await writeFile(new URL(`${indexnowKey}.txt`, output), indexnowKey);
console.log("Built public site files in dist/");
