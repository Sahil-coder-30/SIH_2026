# Setup Rules — Full Rationale

These apply to every pattern in this skill. SKILL.md lists them tersely; this doc explains *why*, so future-you (or future-agent) doesn't quietly drop one when under time pressure.

## 1. `useLayoutEffect`, not `useEffect`

`useEffect` runs after the browser paints. If GSAP sets initial hidden/offset states (e.g. `opacity: 0` for a reveal) inside `useEffect`, there's a visible flash of the fully-visible element before JS applies the animation's starting state. `useLayoutEffect` runs synchronously before paint, eliminating the flash.

## 2. `gsap.context()` + cleanup

```jsx
useLayoutEffect(() => {
  const ctx = gsap.context(() => {
    // all gsap.to/from/timeline/ScrollTrigger.create calls here
  }, scopeRef); // optional: scopes selector text ('.step-card') to this ref's subtree
  return () => ctx.revert();
}, []);
```

Without this: React StrictMode (dev mode) intentionally double-invokes effects, and Vite/webpack hot module reload re-runs component code without a full page refresh. Both scenarios re-run your GSAP setup code *without* the previous run being cleaned up, so you accumulate duplicate `ScrollTrigger` instances — symptoms are animations firing twice, janky/conflicting scroll positions, or triggers pointing at stale/unmounted DOM nodes. `ctx.revert()` kills everything created inside that context (tweens, timelines, ScrollTriggers) in one call.

## 3. Transform/opacity only

Browsers can animate `transform` and `opacity` on the compositor thread (GPU), skipping layout and paint entirely. Animating `top`, `left`, `width`, `height`, or `margin` forces a full layout recalculation on every scroll tick during a `scrub` animation — this is the most common cause of janky/stuttery scroll animations. Always express motion as `x`/`y`/`scale`/`rotate` (via `transform`) instead.

## 4. `ScrollTrigger.refresh()`

ScrollTrigger calculates each trigger's start/end pixel positions once, based on the page's layout *at that moment*. If images load later and push content down, or fonts swap in and reflow text, those cached positions go stale — triggers fire early/late or not at all. Call `ScrollTrigger.refresh()` after:
- Images finish loading (`<img onLoad={...}>` or `window.addEventListener('load', ...)`)
- Route changes in an SPA
- Any async content injection that changes page height

## 5. `markers: true` while building

```js
ScrollTrigger.create({ ...config, markers: true });
```

Draws the trigger's start/end points directly on the page during dev, so you can see exactly where a trigger fires without guessing from scroll feel alone. **Always remove before shipping** — it renders visible debug UI in production if left in.

## 6. `ScrollTrigger.matchMedia()` for responsive

```jsx
ScrollTrigger.matchMedia({
  "(min-width: 768px)": function () {
    // desktop: full pin/curtain/parallax animation
  },
  "(max-width: 767px)": function () {
    // mobile: simplified fade, or no ScrollTrigger at all
  },
});
```

Pinning, horizontal scroll, and heavy parallax often feel wrong or perform poorly on mobile (small viewport, touch scroll physics, limited GPU headroom). Rather than writing one animation and fighting it with media-query CSS overrides, branch the *JS setup itself* per breakpoint. `matchMedia` also handles cleanup automatically when the breakpoint no longer matches.

---

## Troubleshooting checklist

Run through this before considering any ScrollTrigger animation "done":

- [ ] `gsap.context()` wraps all GSAP calls in the effect, with `ctx.revert()` in cleanup
- [ ] `useLayoutEffect`, not `useEffect`
- [ ] Only `transform`/`opacity` properties are animated (no `top`/`left`/`width`/`height` in scrub)
- [ ] `end` values computed from real element dimensions (`offsetHeight`/`offsetWidth`) when content length can vary, not hardcoded magic numbers
- [ ] `ScrollTrigger.refresh()` called after async image/font loads if the section has them
- [ ] `markers: true` removed from all triggers before shipping
- [ ] Tested with `ScrollTrigger.matchMedia()` on a real mobile viewport — pinned/horizontal sections especially often need a simplified or disabled mobile path
- [ ] No manual `position: fixed` set in CSS on elements that also have `pin: true` (let ScrollTrigger own it)
- [ ] Elements with a JS-driven initial hidden state also have a matching CSS fallback (e.g. `opacity: 0` in the stylesheet) to avoid FOUC before JS runs

## Symptom → likely cause

| Symptom | Likely cause |
|---|---|
| Animation fires twice / feels doubled | Missing `gsap.context()` cleanup — duplicate ScrollTriggers from StrictMode/HMR |
| Flash of unanimated content on load | Used `useEffect` instead of `useLayoutEffect`, or no CSS fallback for initial state |
| Janky/stuttery scrub | Animating layout properties instead of `transform` |
| Trigger fires at the wrong scroll position after content loads | Missing `ScrollTrigger.refresh()` call post-load |
| Layout jumps when a pinned section unpins | `pinSpacing` disabled or `end` miscalculated |
| Works on desktop, broken/janky on mobile | No `matchMedia` branch for small viewports |
