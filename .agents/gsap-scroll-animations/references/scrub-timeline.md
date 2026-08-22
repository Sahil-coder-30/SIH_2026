# Pattern 2 — Scrub-Linked Timeline

**Use for:** any animation whose progress should map directly to scroll position rather than play on a timer — progress bars, unfolding diagrams, multi-step reveals as the user scrolls through one pinned section.

## Annotated implementation

```jsx
import { useRef, useLayoutEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

function SteppedReveal() {
  const sectionRef = useRef(null);

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: sectionRef.current,
          start: "top top",
          end: "+=200%",   // 2 viewport-heights of scroll to play the whole timeline
          scrub: 1,          // number = smoothed lag (feels better than `true` on trackpads)
          pin: true,
        },
      });

      tl.to(".step-1", { opacity: 1, y: 0 })
        .to(".step-1", { opacity: 0, y: -50 })
        .to(".step-2", { opacity: 1, y: 0 })
        .to(".step-2", { opacity: 0, y: -50 })
        .to(".step-3", { opacity: 1, y: 0 });
    }, sectionRef);
    return () => ctx.revert();
  }, []);

  return (
    <section ref={sectionRef}>
      <div className="step-1">Step one content</div>
      <div className="step-2">Step two content</div>
      <div className="step-3">Step three content</div>
    </section>
  );
}
```

## Key details

- `scrub: true` = the animation is perfectly locked to the scrollbar position — precise, but can feel stuttery on trackpad/mouse-wheel input.
- `scrub: 0.5–1.5` (a number) = smoothing lag in seconds — the animation "catches up" to scroll position. **Prefer this by default**, it feels far less jarring.
- `end: "+=200%"` means "200% of the viewport height of additional scroll distance" — tune this to however much scroll distance the full multi-step sequence should take. Longer `end` = slower-feeling, more scroll required per step.
- Combine with `pin: true` on the same trigger when the steps should replace each other in the same visual space (as above). Omit `pin` if the steps are just scrubbed independently while the page scrolls normally.
- Elements not part of the tween's `.to()` calls should start in their initial (usually hidden) CSS state so there's no flash before JS runs — set `opacity: 0` in CSS as a fallback for `.step-2`/`.step-3`.

## Common mistakes

- Forgetting a sane `end` distance — too short and the whole sequence blows by in a fraction of a scroll; too long and it feels stuck.
- Chaining too many `.to()` calls in one scrub timeline for complex sequences — beyond ~5-6 steps, consider `references/stagger-reveal.md` per-section instead of one giant scrubbed timeline.
- Not giving un-animated elements a default hidden CSS state, causing FOUC (flash of unstyled content) before GSAP applies initial values.
