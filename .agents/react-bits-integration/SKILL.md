---
name: react-bits-integration
description: Complete workflow for integrating any React Bits (reactbits.dev) component into a production codebase — installation via the shadcn CLI registry, dependency conflict resolution, client/server boundary handling, brand theming (stripping demo colors), performance gating (lazy-load, pause off-screen, reduced motion, DPR capping), animation-loop cleanup verification, and shadcn-overlay stacking conflicts. Use this whenever adding, importing, wiring up, or debugging a React Bits component (Lightfall or any other canvas/WebGL/GSAP-style visual effect from that library) — even if React Bits isn't named explicitly, if the component matches that style (particle/shader backgrounds, animated text, cursor effects), check this skill before improvising a from-scratch integration. Includes an automated audit script, an install wrapper script, a reusable production-ready wrapper component template, and a provenance-doc template.
compatibility: Node.js + npm/pnpm/yarn, git, shadcn CLI (npx shadcn), bash. Covers both Vite/CSR and Next.js/SSR projects.
---

# React Bits component integration

A React Bits component is source code copied directly into the repo (via the
shadcn CLI registry mechanism) — not a versioned npm dependency. Every install
is a one-time snapshot: nothing about it is auto-patched, auto-themed, or
auto-verified. Work through the steps below for every component pulled in;
never mark one done just because it compiled and rendered once in dev.

## Workflow

1. **Preflight + install** — run `scripts/install-component.sh <registry-url>`.
   It checks `components.json` exists, snapshots `package.json` before
   install, runs the shadcn CLI, and prints the dependency diff. Details on
   what to do with that diff: `references/install-and-dependencies.md`.
2. **Audit the new file** — run `scripts/audit-component.sh <path-to-file>`.
   It flags stray hex colors, missing cleanup, missing `"use client"`, and
   missing off-screen-pause support. Fix everything it flags before moving on.
3. **Theme it** — strip every demo-default color, map to the real brand
   palette. `references/theming-and-branding.md`.
4. **Wire client boundary + cleanup** — confirm SSR handling (if applicable)
   and verify teardown actually works, not just compiles.
   `references/client-boundary-and-cleanup.md`.
5. **Gate performance** — lazy-load, pause off-screen, respect
   `prefers-reduced-motion`, cap DPR on mobile. Start from
   `assets/component-wrapper.template.jsx` rather than writing this from
   scratch each time. Full rationale: `references/performance-gating.md`.
6. **Check portal/stacking conflicts** if the page also uses shadcn overlay
   components (Dialog, DropdownMenu, Popover, Select) near the visual
   section. `references/portal-stacking.md`.
7. **Document provenance** — copy `assets/PROVENANCE.template.md` next to the
   component and fill it in, so a future re-install doesn't silently
   overwrite customizations.
8. **If something's already broken**, go straight to
   `references/breakpoints.md` — symptom-to-cause-to-fix lookup table.

## Reference index

| File | Read this when... |
|---|---|
| `references/install-and-dependencies.md` | Installing, or resolving a dependency version conflict |
| `references/theming-and-branding.md` | Setting brand colors, or a stray demo color is showing through |
| `references/client-boundary-and-cleanup.md` | Deciding on SSR handling, or verifying a component actually tears down on unmount |
| `references/performance-gating.md` | Wiring lazy-load, pause-off-screen, reduced-motion, or DPR capping |
| `references/portal-stacking.md` | A modal/dropdown renders behind or gets clipped by a canvas section |
| `references/breakpoints.md` | Something is already broken and you need symptom → cause → fix fast |

## Bundled tools

- `scripts/install-component.sh` — preflight-checked wrapper around
  `npx shadcn add`, snapshots and diffs `package.json` automatically.
- `scripts/audit-component.sh` — automated grep-based check for stray hex
  colors, missing cleanup, missing `"use client"`, and missing pause support.
  Run this on every new component file before calling the integration done.
- `assets/component-wrapper.template.jsx` — copy-paste starting point for
  wrapping any new canvas/WebGL React Bits component with lazy-load,
  pause-off-screen, reduced-motion, and DPR capping already wired.
- `assets/PROVENANCE.template.md` — fill in and commit next to every pulled
  component.

## Non-negotiables (apply to every single integration)

- Never leave a color prop at its React Bits demo default.
- Never skip the DevTools cleanup check — a passing compile is not proof of
  proper teardown (leaked WebGL contexts and dangling RAF loops both compile
  fine and only show up after extended use).
- Never let two different major versions of the same animation/3D library
  (`three`, `gsap`, `framer-motion`, `ogl`, etc.) coexist in the bundle.
- Always document provenance (source URL, date, variant, customizations) next
  to the file — treat it as first-party code from the moment it's pulled in,
  not a package that auto-updates.
