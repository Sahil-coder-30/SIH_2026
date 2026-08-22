import { useRef, useLayoutEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

/**
 * Scrub-Linked Timeline — see references/scrub-timeline.md
 *
 * `steps` is an array of selector strings (e.g. [".step-1", ".step-2", ".step-3"])
 * animated in sequence, tied to scroll position within one pinned section.
 * Tune `scrollDistance` (viewport-height multiples) to control how much scroll
 * the full sequence takes.
 */
export default function ScrubTimeline({ children, steps, scrollDistance = 200 }) {
  const sectionRef = useRef(null);

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: sectionRef.current,
          start: "top top",
          end: `+=${scrollDistance}%`,
          scrub: 1,
          pin: true,
        },
      });

      steps.forEach((selector, i) => {
        tl.to(selector, { opacity: 1, y: 0 });
        if (i < steps.length - 1) {
          tl.to(selector, { opacity: 0, y: -50 });
        }
      });
    }, sectionRef);
    return () => ctx.revert();
  }, [steps, scrollDistance]);

  return <section ref={sectionRef}>{children}</section>;
}
