# Install & dependency resolution

## Two ways a component enters the repo

**A. shadcn CLI registry install (preferred):**
```bash
npx shadcn@latest add "https://reactbits.dev/r/<ComponentName>-<Variant>"
```
Requires `components.json` to already exist. If it doesn't:
```bash
npx shadcn@latest init
```
first — this sets the import aliases and Tailwind/CSS variable baseline the
CLI needs to resolve `@/components/...` paths. Skipping init is the single
most common cause of broken imports immediately after install.

**B. Manual copy-paste** — only when the CLI path is unavailable (offline, or
the registry entry is missing). Copy the component source and its declared
dependencies by hand. Everything below still applies — manual copies need the
exact same audit, just without the CLI resolving dependencies for you.

Use `scripts/install-component.sh` for path A — it wraps the preflight check,
the install, and the dependency diff in one step.

## Folder placement

Never let React Bits components land in the same folder as hand-written or
official-shadcn UI components (`components/ui/` by default for both). A
same-named file can silently overwrite first-party code.

Use a dedicated folder, e.g. `components/reactbits/`. If the CLI doesn't
support a `--path` flag for the registry-add command, install normally, then
immediately move the file and fix its import path — don't leave it in the
default location "for now." `scripts/install-component.sh` creates the target
folder and reminds you of this step.

## Dependency conflict resolution

The CLI auto-installs whatever dependencies the registry entry declares
(commonly `ogl`, sometimes `gsap`, `framer-motion`, `three`). Check every new
dependency against what's already in the project:

```bash
npm ls three gsap framer-motion ogl
```

- New library, no conflict → fine.
- Already present, same major → fine.
- Already present, **different major** → stop and resolve before proceeding.

Two copies of `three` or `gsap` in one bundle is a classic silent-bug source:
duplicate module instances mean `instanceof` checks fail, and singletons
(GSAP's global ticker, Three's shared caches) split into two unsynced
instances. Bugs from this show up only in specific interaction sequences —
not on first render — which makes them expensive to debug later.

**Resolution options:**
- If your package manager supports it, pin the shared dependency to one
  version explicitly:
  - npm: `"overrides": { "three": "^0.160.0" }` in `package.json`
  - yarn: `"resolutions": { "three": "^0.160.0" }`
  - pnpm: `"pnpm": { "overrides": { "three": "^0.160.0" } }`
- Re-run install after adding the override and confirm `npm ls <pkg>` now
  shows a single resolved version.
- If the two majors are genuinely incompatible (breaking API changes between
  them), you may need to fork/adapt the pulled component to work against the
  version already in the project rather than the version it was written
  against — check the registry entry's expected version against yours before
  deciding.

## Post-install checklist

- [ ] `components.json` existed (or was initialized) before install.
- [ ] Dependency diff reviewed — see `git diff package.json` or the diff
      `scripts/install-component.sh` prints automatically.
- [ ] No unresolved dependency major-version conflicts (`npm ls` clean).
- [ ] File lives in the dedicated `components/reactbits/`-style folder, not
      mixed with other UI components.
- [ ] Move straight to `scripts/audit-component.sh` next.
