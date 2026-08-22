# Pattern 5 — Horizontal Scroll Section

**Use for:** a row of cards/panels that scroll left-to-right while the page scrolls vertically — common for feature showcases, portfolio pieces, or step-by-step galleries that want to break the normal vertical flow.

## Annotated implementation

```jsx
import { useRef, useLayoutEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

function HorizontalShowcase() {
  const trackRef = useRef(null);

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      const panels = gsap.utils.toArray(".panel");
      gsap.to(panels, {
        xPercent: -100 * (panels.length - 1),
        ease: "none",
        scrollTrigger: {
          trigger: trackRef.current,
          pin: true,
          scrub: 1,
          end: () => "+=" + trackRef.current.offsetWidth,
        },
      });
    }, trackRef);
    return () => ctx.revert();
  }, []);

  return (
    <div ref={trackRef} className="horizontal-track" style={{ display: "flex" }}>
      <div className="panel">Feature 1</div>
      <div className="panel">Feature 2</div>
      <div className="panel">Feature 3</div>
    </div>
  );
}
```

```css
.horizontal-track {
  width: 300%; /* 100% per panel for 3 panels */
  height: 100vh;
}
.panel {
  width: 100vw;
  flex-shrink: 0;
}
```

## Key details

- The container must be pinned (`pin: true`) — the vertical scroll is what drives the horizontal `xPercent` tween; without pinning, both would happen simultaneously and feel chaotic.
- `xPercent: -100 * (panels.length - 1)` moves the track left by exactly enough to bring the last panel fully into view — generalizes to any panel count.
- `end` is computed from the track's actual `offsetWidth` so the scroll distance required matches how much horizontal content there is — more panels = more vertical scroll needed to traverse them, which feels proportional and correct.
- CSS: track needs `display: flex` with each `.panel` at `width: 100vw` (or however wide you want each panel) and `flex-shrink: 0` so they don't compress.

## Common mistakes

- Forgetting `flex-shrink: 0` on panels — they'll compress to fit instead of staying full width, breaking the effect.
- Not pinning the track — without `pin: true` the section just scrolls away vertically while trying to also animate horizontally, which looks broken.
- Fixed pixel widths instead of `vw`/percentage — breaks responsiveness across screen sizes. Prefer `100vw` per panel or a CSS variable driven by panel count.
- This pattern is heavy on mobile (forces horizontal interaction on a vertical-scroll device) — strongly consider disabling it via `ScrollTrigger.matchMedia()` for small viewports and falling back to a normal scrollable flex row instead.
