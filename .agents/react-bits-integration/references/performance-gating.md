# Performance gating

Canvas/WebGL/shader components run their own render loop independent of
React's render cycle. Left unmanaged, they burn GPU and battery even when not
visible, not needed, or on a device that can't afford it. None of the
following happens automatically — every point here is something you wire up
yourself. `assets/component-wrapper.template.jsx` has all four implemented
together as a starting point.

## Lazy load

Don't let canvas/WebGL code sit in the shared/main bundle if it's only used
on one route.
```jsx
const ReactBitsComponent = lazy(() => import('./ReactBitsComponent'));
// or, Next.js: dynamic(() => import('./ReactBitsComponent'), { ssr: false })
```

## Pause when off-screen

These components almost always expose a `paused` prop but never auto-pause
themselves. Wire an `IntersectionObserver` on the containing section and flip
`paused` based on visibility:
```jsx
const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting));
```
Don't let it keep rendering while scrolled past, or in a backgrounded tab.

## Respect prefers-reduced-motion

```js
window.matchMedia('(prefers-reduced-motion: reduce)').matches
```
Either drop intensity props (particle/streak counts, speed, glow) sharply, or
swap in a static fallback (gradient, still image) for users who've opted out
of motion at the OS level. This is an accessibility requirement, not a nice-
to-have — treat a missing check here as a bug, not a polish item.

## Cap DPR on mobile

Retina devices at full canvas resolution (`window.devicePixelRatio`, often
2-3x) are the most common mobile performance complaint with these components.
Cap explicitly rather than trusting the raw value:
```js
const dpr = window.innerWidth < 768 ? 1 : Math.min(window.devicePixelRatio || 1, 2);
```

## Disable mouse-interaction on touch

Pointer-follow effects do nothing useful on touch devices, but the listeners
still attach and run unless explicitly disabled:
```js
const isTouch = 'ontouchstart' in window;
<ReactBitsComponent mouseInteraction={!isTouch} />
```

## Scroll-linked props: throttle, don't stream

If a component's intensity should react to scroll position (e.g. speed/glow
tied to how close the user is to a CTA), lift the relevant props into React
state driven by a scroll listener or ScrollTrigger `onUpdate` — but throttle
updates to roughly every 100ms, not every scroll tick.

Most React Bits components re-initialize internal state on prop change via
their effect dependency array. Driving props at 60fps causes constant
teardown/rebuild of the internal renderer instead of smooth interpolation —
this is what "choppy" or "stuttery" scroll-linked effects almost always trace
back to.

## Checklist

- [ ] Lazy-loaded if route-specific.
- [ ] Pauses via `IntersectionObserver` when off-screen.
- [ ] `prefers-reduced-motion` checked, with a real fallback (not just
      "slightly less motion").
- [ ] DPR capped, especially under ~768px viewport width.
- [ ] Mouse-interaction disabled on touch devices.
- [ ] Any scroll-linked props throttled (~100ms), not streamed per frame.
