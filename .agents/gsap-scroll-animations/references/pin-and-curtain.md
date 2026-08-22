# Pattern 1 — Pin & Curtain Reveal

**Use for:** a hero/background section that stays fixed in the viewport while the *next* section slides up and fully covers it like a curtain. Once fully covered, the pin releases and normal scrolling resumes for the rest of the page.

Example: Taksha landing page — `Hero` ("Describe your app...") stays pinned behind while the glassmorphic `HowItWorks` section slides up over it.

## Annotated implementation

```jsx
import { useRef, useLayoutEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

function LandingPage() {
  const containerRef = useRef(null);
  const heroRef = useRef(null);
  const nextSectionRef = useRef(null);

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      ScrollTrigger.create({
        trigger: heroRef.current,
        start: "top top",
        // computed from the REAL height of the covering section, not a magic number —
        // this is what makes the pin release exactly when it's fully covered
        end: () => "+=" + nextSectionRef.current.offsetHeight,
        pin: true,
        pinSpacing: true,   // reserves the pinned element's space in flow, prevents layout jump on unpin
        scrub: 1,            // ties motion to scroll position; drop this for a one-shot timed play instead
        // markers: true,    // debug only, remove before ship
      });
    }, containerRef);
    return () => ctx.revert();
  }, []);

  return (
    <div ref={containerRef}>
      <section ref={heroRef} className="hero" style={{ willChange: "transform" }}>
        {/* Hero content */}
      </section>
      <section ref={nextSectionRef} className="how-it-works">
        {/* Reveal content — MUST have an opaque/blurred background, see below */}
      </section>
    </div>
  );
}
```

## Key details

- `pin: true` fixes `heroRef` in the viewport for the trigger's active duration — GSAP handles the `position: fixed` mechanics internally, don't set it manually in CSS.
- `end` is a **function**, not a string, when it depends on another element's size — GSAP calls it lazily so it's correct even if content/height changes after mount (images loading, responsive text wrap, etc).
- `pinSpacing: true` is the default but state it explicitly — without it the document doesn't reserve the pinned element's height, causing content below to jump up.
- The revealing section (`nextSectionRef`) **needs a background that actually occludes** — solid color, gradient, or `backdrop-filter: blur()` glassmorphism. If it's transparent, the hero will visibly show through as it "covers" it, breaking the illusion. This is the single most common mistake with this pattern.
- Z-index: normal DOM order + natural stacking context is usually enough since the pinned element is `position: fixed` and the next section scrolls normally above it in paint order. Only add explicit `z-index` if you have other fixed/sticky elements competing (nav bars, etc).

## Common mistakes

- Using a fixed `end: "+=1000"` instead of computing from `offsetHeight` — breaks the moment content length changes.
- Forgetting `pinSpacing`, causing content after the reveal section to jump up when the pin releases.
- Transparent/no background on the revealing section — hero bleeds through.
- Setting `position: fixed` manually in CSS on the pinned element in addition to `pin: true` — causes double-transform bugs. Let ScrollTrigger own the positioning.
