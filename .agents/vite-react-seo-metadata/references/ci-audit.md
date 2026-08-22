# Wiring the audit into a deployment pipeline

The goal: a deploy should fail loudly if `scripts/audit.mjs` finds placeholder
or missing metadata, instead of shipping it silently. Run the audit against the
*project root* (where `index.html` and `package.json` live) — it reads source
files, not the build output, so it doesn't need a build step first.

## GitHub Actions

```yaml
# .github/workflows/seo-audit.yml
name: SEO metadata audit
on: [pull_request, push]
jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - name: Audit SEO metadata
        run: node path/to/vite-react-seo-metadata/scripts/audit.mjs .
```

Make this a required check on the branch protection rule for your deploy
branch so a merge is blocked, not just flagged.

## Vercel

Add it as a pre-build step in `vercel.json` (or the project's build command in
the dashboard):

```json
{
  "buildCommand": "node scripts/audit.mjs . && npm run build"
}
```

`&&` means the build (and therefore the deploy) never runs if the audit exits
non-zero.

## Netlify

In `netlify.toml`:

```toml
[build]
  command = "node scripts/audit.mjs . && npm run build"
```

## Hostinger / generic VPS or custom pipeline

Add the same pattern to whatever runs before `npm run build` / `rsync` /
`docker build` in your deploy script:

```bash
node scripts/audit.mjs . || { echo "SEO audit failed — aborting deploy"; exit 1; }
npm run build
# ...rest of deploy
```

## Local pre-push hook (optional, catches it even earlier)

```bash
# .husky/pre-push  (requires husky installed)
node scripts/audit.mjs .
```

## What NOT to do

Don't run the audit against the built `dist/` output as your only check —
if the source `index.html` template is wrong, every build inherits the same
placeholder, so catching it at the source is both earlier and simpler. Auditing
`dist/` in addition is only useful if you also have a prerendering step that
could introduce its own bugs independently of the source template.
