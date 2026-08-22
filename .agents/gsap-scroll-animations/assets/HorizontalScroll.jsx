import { useRef, useLayoutEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

/**
 * Horizontal Scroll Section — see references/horizontal-scroll.md
 *
 * `panels` is an array of React nodes, each rendered as one full-width panel
 * that the user scrolls through horizontally while scrolling the page vertically.
 *
 * Required CSS (or pass equivalent via className):
 *   .horizontal-track { display: flex; }
 *   .panel { width: 100vw; flex-shrink: 0; }
 *
 * Consider disabling this pattern on mobile via ScrollTrigger.matchMedia()
 * (see references/setup-and-gotchas.md) — forced horizontal interaction on
 * touch devices often feels wrong.
 */
export default function HorizontalScroll({ panels }) {
  const trackRef = useRef(null);

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      const panelEls = gsap.utils.toArray(".panel", trackRef.current);
      gsap.to(panelEls, {
        xPercent: -100 * (panelEls.length - 1),
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
  }, [panels.length]);

  return (
    <div ref={trackRef} className="horizontal-track" style={{ display: "flex" }}>
      {panels.map((panel, i) => (
        <div key={i} className="panel" style={{ width: "100vw", flexShrink: 0 }}>
          {panel}
        </div>
      ))}
    </div>
  );
}
