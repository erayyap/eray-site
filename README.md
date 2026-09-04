# eray-site

Personal portfolio website for **Eray Yapağcı** — built from his CV.

Plain static HTML / CSS / JS. No build step, no dependencies. Deployable directly with GitHub Pages.

## Structure

- `index.html` — single-page site (About, Experience, Projects, Activities, Contact)
- `styles.css` — design tokens, light/dark themes, responsive layout
- `script.js` — theme toggle, mobile nav, hero word rotator, scroll-reveal
- `ErayYapagciCV.pdf` — downloadable CV

## Local preview

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

## Deploy with GitHub Pages

Repo **Settings → Pages → Source: Deploy from a branch → `main` / root**.
The site is served from the repository root, so no `/docs` folder or build action is needed.
