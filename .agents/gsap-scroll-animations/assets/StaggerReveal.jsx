import { useRef, useLayoutEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

/**
 * Stagger Reveal on Enter — see references/stagger-reveal.md
 *
 * Wrap any grid/list of items with this; each direct child gets a
 * fade + slide-up reveal, staggered, when the container scrolls into view.
 */
export default function StaggerReveal({
  children,
  itemSelector = ".stagger-item",
  stagger = 0.15,
  y = 40,
  persist = false, // true = "play none none none" (stays revealed once shown)
}) {
  const containerRef = useRef(null);

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from(itemSelector, {
        opacity: 0,
        y,
        duration: 0.8,
        stagger,
        ease: "power2.out",
        scrollTrigger: {
          trigger: containerRef.current,
          start: "top 80%",
          toggleActions: persist ? "play none none none" : "play none none reverse",
        },
      });
    }, containerRef);
    return () => ctx.revert();
  }, [itemSelector, stagger, y, persist]);

  return <div ref={containerRef}>{children}</div>;
}
