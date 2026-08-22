# Pattern 4 — Parallax Layers

**Use for:** background elements (ambient glow, particles, blobs, decorative shapes) moving at a different speed than foreground content as the page scrolls — adds depth without being a "reveal" mechanic. Visible in Taksha's hero background glow/stars.

## Annotated implementation

```jsx
import { useRef, useLayoutEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

function ParallaxBackground() {
  const containerRef = useRef(null);

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      gsap.utils.toArray(".parallax-layer").forEach((layer) => {
        const speed = parseFloat(layer.dataset.speed) || 0.5; // set per-element via data-speed="0.3"
        gsap.to(layer, {
          y: () => -(ScrollTrigger.maxScroll(window) * speed),
          ease: "none",
          scrollTrigger: { start: 0, end: "max", scrub: 0 },
        });
      });
    }, containerRef);
    return () => ctx.revert();
  }, []);

  return (
    <div ref={containerRef} className="hero">
      <div className="parallax-layer" data-speed="0.2" style={{ willChange: "transform" }}>
        {/* far background glow — moves slowest */}
      </div>
      <div className="parallax-layer" data-speed="0.5" style={{ willChange: "transform" }}>
        {/* mid-ground particles */}
      </div>
      <div className="hero-content">{/* foreground text, no parallax */}</div>
    </div>
  );
}
```

## Key details

- `data-speed` on each layer lets you tune multiple layers from markup without touching JS — lower speed = moves less relative to scroll = reads as "farther away."
- `ScrollTrigger.maxScroll(window)` gets total scrollable distance of the page, so the layer's total travel distance scales to full-page scroll, not just its own section.
- `scrub: 0` (not `false`) ties it directly to scroll with zero smoothing lag — parallax should feel tightly locked to scroll, unlike content reveals where slight smoothing feels better.
- `ease: "none"` — parallax should be linear; easing curves make it feel like it's catching up/slowing down unnaturally.
- Keep parallax subtle (speed values 0.1–0.6) — large speed differences between layers looks glitchy rather than "deep."

## Common mistakes

- Applying parallax to the same element that also has text/interactive content — parallax offsets can misalign click targets and readability; keep it to purely decorative layers.
- Using `end: "max"` when the parallax should only apply within one section, not the whole page — scope `start`/`end` to the section's trigger instead if it's local rather than page-wide.
- Too many layers at similar speeds — differentiate speeds meaningfully (e.g. 0.2 / 0.4 / 0.6) rather than 0.45 / 0.5 / 0.55 which reads as visual noise.
