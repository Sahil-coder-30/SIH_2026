import { useRef, useLayoutEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

/**
 * Parallax Layers — see references/parallax.md
 *
 * Wrap decorative background content with this. Each direct descendant
 * matching `layerSelector` needs a `data-speed="0.2"`-style attribute
 * (lower = moves less = reads as farther away). Do NOT put interactive
 * or text content inside parallax layers — keep it purely decorative.
 */
export default function Parallax({ children, layerSelector = ".parallax-layer" }) {
  const containerRef = useRef(null);

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      gsap.utils.toArray(layerSelector).forEach((layer) => {
        const speed = parseFloat(layer.dataset.speed) || 0.5;
        gsap.to(layer, {
          y: () => -(ScrollTrigger.maxScroll(window) * speed),
          ease: "none",
          scrollTrigger: { start: 0, end: "max", scrub: 0 },
        });
      });
    }, containerRef);
    return () => ctx.revert();
  }, [layerSelector]);

  return <div ref={containerRef}>{children}</div>;
}
