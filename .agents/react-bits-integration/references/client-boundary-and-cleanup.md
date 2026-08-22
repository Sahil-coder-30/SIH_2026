# Client boundary & cleanup verification

Almost every React Bits component uses hooks, refs targeting a DOM node,
`window`/`document`, or a canvas/WebGL context — none of which exist during
server rendering. Whether this matters, and how, depends on the framework.

## Which situation applies

**Plain Vite / CRA client-side-rendered app (no SSR at all):**
There is no server render step, so `"use client"` is irrelevant and nothing
will throw from missing it. The only thing that still matters: keep any
browser-only code (canvas refs, `window` reads, WebGL context creation)
inside `useEffect`/`useLayoutEffect`, not in the component body during
render. This isn't for SSR safety here — it's so the component doesn't break
if the project ever adds a test runner with a partial DOM (jsdom commonly
lacks full canvas/WebGL support) or migrates to an SSR framework later.

**Next.js (App Router) or another SSR framework:**
- [ ] The component file needs `"use client"` at the top if it uses hooks,
      refs, or browser globals — OR the import at the call site must disable
      SSR explicitly:
      ```jsx
      const Lightfall = dynamic(() => import('@/components/reactbits/Lightfall'), { ssr: false });
      ```
- [ ] The CLI does not add `"use client"` for you. Check every file pulled in
      by the install, not just the top-level component — some registry
      entries include helper files that also touch browser APIs.
- [ ] If this is skipped, the failure mode is specific: it throws only in
      production build / SSR, not in `next dev` with client-only testing. Test
      `next build && next start` at least once, don't rely on dev-mode
      behavior alone.

## Cleanup verification

Most of these components set up a `requestAnimationFrame` loop, a
`ResizeObserver`, and pointer event listeners inside a `useEffect`.

**What the cleanup function should contain**, at minimum:
- `cancelAnimationFrame(...)` for any RAF loop
- `resizeObserver.disconnect()`
- `removeEventListener` for any manually-attached listeners (pointer/mouse
  events are the common one)
- The underlying library's own dispose call if one exists — e.g. an OGL
  `Renderer` losing its WebGL context, or an explicit `.destroy()` /
  `.dispose()` method

`scripts/audit-component.sh` checks for the presence of these calls by name,
but presence isn't proof of correctness — actually test it:

1. Mount the component (navigate to the page).
2. Navigate away.
3. Check the browser console — no errors.
4. Open DevTools → Performance or Memory tab, confirm the RAF loop actually
   stopped (no continuous frame activity after navigating away) and the
   canvas/WebGL context was released.

A component that keeps rendering after unmount is a memory leak that only
shows up after extended navigation — not on first load — which is exactly the
kind of thing that passes a quick manual QA pass and then causes tab slowdown
in production days later.

## Multiple WebGL contexts in one session

If more than one WebGL-based effect exists in the app (e.g. one on a landing
page, a different one on a payments/checkout page) and a user can navigate
between them in the same tab session:

- [ ] Confirm each context is actually released on unmount (previous
      section). Browsers cap the number of live WebGL contexts per tab —
      typically browser-dependent, don't assume it's unlimited — and a leaked
      context on route A will cause route B's effect to silently fail to
      initialize with no obvious error pointing back to the real cause.

## Checklist

- [ ] Browser-only code confined to effects, not render body (applies
      regardless of framework).
- [ ] `"use client"` / `ssr: false` applied everywhere needed, if SSR
      framework in use. Production build tested at least once.
- [ ] Cleanup function verified in DevTools, not just present in source.
- [ ] If multiple WebGL contexts can coexist across routes in one session,
      confirmed release-on-unmount for each.
