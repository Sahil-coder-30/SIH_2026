# Break-point reference

Symptom → likely cause → where to fix it. Use this first when something's
already broken; it's faster than re-reading the full workflow.

| Symptom | Likely cause | Fix |
|---|---|---|
| Import fails right after `npx shadcn add` | `components.json` missing or misconfigured before install | `references/install-and-dependencies.md` — run `shadcn init` first, reinstall |
| Component throws only on production build, not dev | Missing `"use client"` or `ssr: false` (SSR frameworks only) | `references/client-boundary-and-cleanup.md` |
| Two visual effects on different routes, second one never renders | Leaked WebGL context from the first, not released on unmount | `references/client-boundary-and-cleanup.md` — verify dispose logic |
| Colors look like the React Bits demo, not the brand | Props left at default, or a hardcoded hex buried in source | `references/theming-and-branding.md` |
| Visible seam/rectangle where the canvas sits | `backgroundColor` prop doesn't match the actual page background | `references/theming-and-branding.md` |
| Random `instanceof`/singleton bugs, animation library behaving inconsistently | Duplicate major versions of the same lib bundled twice | `references/install-and-dependencies.md` — check `npm ls` |
| Dropdown/modal renders behind or clipped by a canvas section | Portal stacking conflict with a custom z-index/overflow context | `references/portal-stacking.md` |
| Tab slows down / memory climbs after extended use | Cleanup function incomplete — RAF loop or observer never torn down | `references/client-boundary-and-cleanup.md` — DevTools verification |
| Overwritten customizations after a teammate re-ran the install command | No documented provenance, treated as a package instead of owned code | `assets/PROVENANCE.template.md` — always fill in, always commit |
| Effect looks choppy/stuttery when tied to scroll | Props driven every scroll tick, causing constant internal re-init | `references/performance-gating.md` — throttle to ~100ms |
| Fine on desktop, janky/battery-draining on mobile | DPR not capped, mouse-interaction listeners still active on touch | `references/performance-gating.md` |
| Effect doesn't respect OS-level reduced-motion setting | `prefers-reduced-motion` never checked | `references/performance-gating.md` |
| Effect keeps running/rendering while scrolled far past it | No `IntersectionObserver` wired to the `paused` prop | `references/performance-gating.md`, `assets/component-wrapper.template.jsx` |
