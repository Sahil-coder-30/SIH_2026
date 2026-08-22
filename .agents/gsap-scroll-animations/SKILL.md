---
name: gsap-scroll-animations
description: Build scroll-driven animations in React using react-gsap / gsap + ScrollTrigger — pinned sections, curtain reveals, scrub-linked timelines, stagger-on-enter cards, parallax layers, and horizontal scroll sections. Use this skill whenever the user asks for scroll animations, "pin this section", "reveal on scroll", "sticky hero", "parallax", "curtain effect", "sections that scroll over each other", landing-page motion design, or anything involving ScrollTrigger — even if they don't say "GSAP" explicitly. Also consult this before writing ANY new ScrollTrigger code, to stay consistent with the setup/cleanup conventions below and avoid common React + GSAP bugs (duplicate triggers, stale refs, layout jumps).
---

# GSAP Scroll Animations (React)

A growing reference for scroll-driven animation in React with `gsap` + `ScrollTrigger`. This file is the index — it has the setup rules that apply to *every* pattern, a table to pick the right pattern, and pointers to the deep-dive doc + ready-to-copy component for each. Read `references/<pattern>.md` for the one you need; don't load all of them.

## Setup (non-negotiable, every time)

```bash
npm install gsap
```

```jsx
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
gsap.registerPlugin(ScrollTrigger);
```

1. **`useLayoutEffect`, not `useEffect`** — animation must be wired before paint or you get a flash of unanimated content.
2. **`gsap.context()` scoped to a container ref + `return () => ctx.revert()`** — without this, React StrictMode double-invoke and hot reload spawn duplicate/zombie ScrollTriggers. This is the #1 source of bugs.
3. **Animate `transform`/`opacity` only** (`x`, `y`, `scale`, `opacity`). Never scrub `top`/`left`/`width`/`height` — not GPU-accelerated, will jank.
4. **`ScrollTrigger.refresh()`** after images/fonts load or on route change — layout shifts invalidate trigger start/end math.
5. **`markers: true`** while building, always stripped before shipping.
6. **`ScrollTrigger.matchMedia()`** for responsive — don't fight one timeline across breakpoints; give mobile a simpler or no-op version. See `references/troubleshooting.md`.

Full detail and the reasoning behind each rule: `references/setup-and-gotchas.md`.

## Pattern index

| Request sounds like... | Pattern | Reference doc | Starter component |
|---|---|---|---|
| "this section stays while the next covers it" / sticky hero | Pin & Curtain Reveal | `references/pin-and-curtain.md` | `assets/PinCurtain.jsx` |
| "animate step by step as I scroll through this section" | Scrub-Linked Timeline | `references/scrub-timeline.md` | `assets/ScrubTimeline.jsx` |
| "cards/items fade or slide in as they appear" | Stagger Reveal on Enter | `references/stagger-reveal.md` | `assets/StaggerReveal.jsx` |
| "background moves slower/faster than foreground" | Parallax Layers | `references/parallax.md` | `assets/Parallax.jsx` |
| "scrolls sideways" / horizontal feature showcase | Horizontal Scroll Section | `references/horizontal-scroll.md` | `assets/HorizontalScroll.jsx` |

Workflow: pick the row that matches the request → read that one reference doc → adapt the matching asset component → verify against the checklist in `references/troubleshooting.md` before calling it done.

## Growing this skill

When a new animation request doesn't fit an existing pattern:
1. Build it, following the setup rules above.
2. Once it works, add a new `references/<pattern-name>.md` (same structure as the others: when to use it, annotated snippet, key details, common mistakes) and a matching `assets/<PatternName>.jsx` starter.
3. Add a row to the Pattern index table above.

This keeps the skill compounding — each new animation type built for this project becomes reusable for the next one instead of solved from scratch.
