# eray-site

Personal homepage for **Eray Yapağcı** — a short introduction, publications, and selected projects.

Plain static HTML / CSS / JS. No frontend framework or runtime dependencies. Deployed as static assets on Cloudflare Workers; no Worker script is needed.

## Local preview

For a simple preview without Node:

```bash
python3 -m http.server 8000
# http://localhost:8000
```

To preview with Cloudflare's local runtime (Node.js 22+ recommended):

```bash
npm ci
npm run dev
# http://localhost:8787
```

Re-run `npm run build` after editing source files to refresh the assets used by Wrangler.

## Deploy to Cloudflare Workers

```bash
npm ci
npx wrangler login
npm run deploy
```

Wrangler deploys the `eray-site` Worker and prints its `workers.dev` URL. Change `name` in `wrangler.jsonc` if a different Worker name is needed. Select your Cloudflare account when prompted. A custom domain can be added in the Worker's **Settings → Domains & Routes**.

### GitHub-connected deployment (Workers Builds)

In Cloudflare, go to **Workers & Pages → Create application → Import a repository** (UI wording may vary). Select this repository and configure:

- Production branch: `main`
- Root directory: repository root
- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`

The build system installs dependencies from `package-lock.json`. Keep the Cloudflare Worker name aligned with `eray-site` in `wrangler.jsonc`. This is a **Workers** setup, not a Pages output-directory setup.

## Validation and deployment safety

```bash
npm run check:deploy
```

This builds the site and validates the Worker deployment without publishing it.

`scripts/build.mjs` copies only `index.html`, `styles.css`, and `script.js` into `dist/`. Wrangler uploads only that directory, never the repository root. Private `agent_docs/`, credentials, source tooling, and Git files are excluded. Add future public assets explicitly to the build allowlist.

Unknown paths return 404; this single-page site uses section anchors and does not need SPA routing. `dist/`, local Wrangler state, and environment files are gitignored.
