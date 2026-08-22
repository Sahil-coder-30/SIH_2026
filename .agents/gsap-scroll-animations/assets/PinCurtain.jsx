import { useRef, useLayoutEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

/**
 * Pin & Curtain Reveal — see references/pin-and-curtain.md
 *
 * `PinnedSection` stays fixed in the viewport while `RevealSection` slides up
 * and fully covers it, then normal scroll resumes.
 *
 * IMPORTANT: RevealSection's background must be opaque/blurred enough to
 * occlude PinnedSection as it slides over — see reference doc.
 */
export default function PinCurtain({ PinnedSection, RevealSection }) {
  const containerRef = useRef(null);
  const pinnedRef = useRef(null);
  const revealRef = useRef(null);

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      ScrollTrigger.create({
        trigger: pinnedRef.current,
        start: "top top",
        end: () => "+=" + revealRef.current.offsetHeight,
        pin: true,
        pinSpacing: true,
        scrub: 1,
        // markers: true, // debug only
      });
    }, containerRef);
    return () => ctx.revert();
  }, []);

  return (
    <div ref={containerRef}>
      <section ref={pinnedRef} style={{ willChange: "transform" }}>
        <PinnedSection />
      </section>
      <section ref={revealRef}>
        <RevealSection />
      </section>
    </div>
  );
}
