# Pattern 3 — Stagger Reveal on Enter

**Use for:** cards, list items, or grid content fading/sliding in with a slight delay between each, as they enter the viewport. Example: the "STEP 01 / 02 / 03" cards in the Taksha "How it works" section.

## Annotated implementation

```jsx
import { useRef, useLayoutEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

function StepCards() {
  const cardsContainerRef = useRef(null);

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from(".step-card", {
        opacity: 0,
        y: 40,
        duration: 0.8,
        stagger: 0.15,
        ease: "power2.out",
        scrollTrigger: {
          trigger: cardsContainerRef.current,
          start: "top 80%",              // fires when container's top hits 80% down the viewport
          toggleActions: "play none none reverse",
        },
      });
    }, cardsContainerRef);
    return () => ctx.revert();
  }, []);

  return (
    <div ref={cardsContainerRef} className="cards-grid">
      <div className="step-card">Step 01</div>
      <div className="step-card">Step 02</div>
      <div className="step-card">Step 03</div>
    </div>
  );
}
```

## Key details

- `gsap.from()` animates *from* the given values *to* the element's current CSS state — simplest way to express "starts hidden/offset, ends at natural position."
- `stagger: 0.15` = 150ms delay between each matched element's animation start. Tune per how many items / how dense the grid is — 0.1–0.2 is a good default range.
- `start: "top 80%"` reads as "when the trigger element's top edge reaches 80% down the viewport" — i.e. fires a bit before the container is fully in view, so it doesn't feel late.
- `toggleActions: "play none none reverse"` = four states for `onEnter onLeave onEnterBack onLeaveBack`. This combo plays once scrolling down, and reverses if the user scrolls back up past the start point — good default for card grids. Use `"play none none none"` if you want it to stay revealed permanently once played (common for "don't re-hide on scroll-up" preference).

## Common mistakes

- Applying the ScrollTrigger to each card individually instead of once on the container with `stagger` — works, but loses the built-in stagger timing and is more code for the same result.
- `start: "top top"` instead of `"top 80%"` — triggers only once the container is basically at the very top of the viewport, which reads as "late" to users; `"top 80%"` or `"top 85%"` feels more natural for enter animations.
- Not memoizing/scoping the `.step-card` selector to the container via `gsap.context()` — without scoping, if there are multiple card grids on the page they'll all animate together.
