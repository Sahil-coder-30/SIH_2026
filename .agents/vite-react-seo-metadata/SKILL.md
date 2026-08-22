---
name: vite-react-seo-metadata
description: Audit and fix placeholder/missing SEO metadata in Vite + React applications before deployment — stale titles like "Vite + React", "React App", or "frontend" in index.html, package.json, and manifest.json; missing or duplicated meta description / Open Graph / Twitter Card tags; missing react-helmet-async wiring for per-route titles; and no pre-deploy audit gate in CI/CD. Use this whenever the user is prepping a Vite+React app for production, mentions deployment checklists, SEO, Google crawlers/indexing, social link previews (WhatsApp/Twitter/LinkedIn unfurls), react-helmet, or asks to check/fix/build the app's head tags and metadata — even if they don't say "SEO" outright. Also use to set up a CI script that blocks a deploy if placeholder metadata is detected.
---

# Vite + React SEO Metadata Skill

Fixes the exact failure mode where a Vite+React app ships to production with the
default scaffold title ("Vite + React", "React App", "frontend") still sitting in
`index.html`, `package.json`, or `public/manifest.json` — invisible in the browser
tab most people ignore, but exactly what Google, WhatsApp, Twitter/X, LinkedIn,
and Slack unfurl bots read, because none of those crawlers execute your JS bundle
before grabbing the static HTML.

## Workflow

Always run in this order: **audit → fix → verify → wire into CI**. Don't skip
straight to `fix.mjs` — the audit output tells you which flags to pass it.

### 1. Locate the project root

Vite root is the directory containing `index.html` next to `package.json` and
`vite.config.*` (NOT inside `public/` — that's a Create React App convention).
If you can't find `index.html` at that level, ask before guessing.

### 2. Run the audit

```bash
node scripts/audit.mjs [path/to/project]
```

Defaults to `.` if no path given. It checks, and prints PASS/FAIL for each:

- `index.html` `<title>` against a placeholder list (`vite + react`, `react app`,
  `vite app`, `frontend`, `vite-project`, `my app`, empty)
- `<meta name="description">` present and non-generic
- Open Graph (`og:title`, `og:description`, `og:image`, `og:url`) and
  `twitter:card` tags present
- `package.json` → `"name"` field against placeholders (`vite-react-app`,
  `react-app`, `frontend`, `vite-project`, `my-app`) and whether it's lowercase
  kebab-case
- `public/manifest.json` (if it exists) → `"name"` / `"short_name"` against the
  same placeholder list
- Whether `react-helmet-async` is a dependency (informational — only matters if
  the app has multiple routes/pages that should each carry their own title)

Exit code is `1` if any check fails — this is what makes it usable as a CI gate,
see step 4.

### 3. Fix what's flagged

```bash
node scripts/fix.mjs --name "Taksha Codespace" \
  --description "AI agentic cloud IDE — describe your app, Taksha builds, tests, and heals it." \
  --url "https://taksha.dev" \
  --og-image "/og-cover.png" \
  [--twitter-handle "@taksha"] \
  [path/to/project]
```

`--name` and `--description` are required; everything else is optional but
recommended once the domain/OG image exist. The script is **idempotent** — run
it twice and it updates existing tags in place rather than duplicating them,
by matching on tag identity (`<title>`, `meta[name=description]`,
`meta[property^="og:"]`, etc.), not by blindly appending.

What it does, file by file:

- **`index.html`**: rewrites `<title>`, sets/creates the description, OG, and
  Twitter Card meta tags, and adds `data-react-helmet="true"` to each so a
  `<Helmet>` block on a specific page can cleanly override the fallback instead
  of stacking a second tag next to it. See `references/helmet-patterns.md` for
  why that attribute matters and how to wire `HelmetProvider` + per-route
  `<Helmet>` blocks — read it before touching route-level pages.
- **`package.json`**: sets `"name"` to a kebab-case slug derived from `--name`
  (only if the current value matches a known placeholder — never overwrites a
  name that's already custom).
- **`public/manifest.json`**: same placeholder-only guard, updates `"name"` and
  `"short_name"` (short_name truncated to 12 chars if `--name` is longer, per
  the manifest spec).

If the project has multiple pages/routes and `react-helmet-async` isn't
installed, the script prints a reminder (it does not run `npm install` itself —
that's a project decision, not a silent side effect).

### 4. Verify

Re-run `node scripts/audit.mjs` — it should now pass. Then spot-check by viewing
source (`curl -s <built-url> | grep -i '<title>'`) against the *built* output,
not just dev server output, since some setups inject metadata differently at
build time.

### 5. Wire into CI so this can't regress

Add the audit as a blocking step before deploy (Vercel/Netlify/Hostinger/GH
Actions). See `references/ci-audit.md` for copy-paste snippets for each. The
core idea is always: `node scripts/audit.mjs ./dist-source-or-project || exit 1`
run *before* the deploy step, not after.

## When SSR/prerendering comes up

If the user's app has SEO-critical public pages (landing pages, blog, docs) and
is pure client-side-rendered Vite React, `fix.mjs` and the audit only get static
fallback tags correct — they can't give per-page tags to bots that don't execute
JS at all (most social unfurlers). In that case, say so plainly and point at two
options rather than silently doing nothing:
1. A prerendering step (e.g. `vite-plugin-prerender` or a Puppeteer-based
   post-build script) for just the public routes.
2. Migrating those routes to a framework with SSR/SSG (Next.js, Remix,
   Astro islands) — this is a bigger call and should be flagged as a
   recommendation, not done unprompted.
Don't attempt an SSR migration as part of this skill — that's a separate,
much larger project decision.

## Edge cases

- **No `index.html` at the expected root**: stop and ask; don't guess between
  multiple candidate files (monorepos sometimes have several Vite apps).
- **`public/manifest.json` missing**: skip that check/fix silently — not every
  app is a PWA and this isn't a required file.
- **Tag already correct**: `fix.mjs` leaves it untouched and reports "already OK"
  rather than rewriting for the sake of it.
- **Custom (non-placeholder) name already set**: `fix.mjs` will not overwrite
  `package.json`/`manifest.json` names that don't match the placeholder list,
  even if `--name` differs — flag the mismatch to the user instead and let them
  decide, since a deliberate rename is different from an unfixed default.
