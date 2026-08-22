/**
 * Template wrapper for any React Bits canvas/WebGL component.
 *
 * Copy this pattern for every new component pulled from reactbits.dev — it
 * wires up the four things these components never do on their own: lazy
 * loading, pausing off-screen, respecting reduced-motion, and DPR capping.
 * See references/performance-gating.md for the rationale behind each piece.
 *
 * Replace `ReactBitsComponent` and its import path with the real component.
 * If this project is Next.js (or another SSR framework), replace the
 * `React.lazy` import below with `next/dynamic` + `{ ssr: false }` — see
 * references/client-boundary-and-cleanup.md.
 */
import { lazy, Suspense, useEffect, useRef, useState } from 'react';

const ReactBitsComponent = lazy(() => import('./ReactBitsComponent'));

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const listener = (e) => setReduced(e.matches);
    mq.addEventListener('change', listener);
    return () => mq.removeEventListener('change', listener);
  }, []);
  return reduced;
}

function useInView(ref) {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    if (!ref.current) return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { threshold: 0.05 }
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [ref]);
  return inView;
}

/**
 * @param {string[]} colors - brand colors, explicit — never rely on the
 *   underlying component's demo defaults.
 * @param {string} backgroundColor - must match the actual page background
 *   token behind this section, or you'll get a visible seam.
 */
export default function BrandedVisualSection({ colors, backgroundColor }) {
  const containerRef = useRef(null);
  const inView = useInView(containerRef);
  const reducedMotion = usePrefersReducedMotion();

  // Cap DPR on mobile — retina at full canvas resolution is the most common
  // mobile performance complaint with these components.
  const dpr =
    typeof window === 'undefined'
      ? 1
      : window.innerWidth < 768
      ? 1
      : Math.min(window.devicePixelRatio || 1, 2);

  const isTouch = typeof window !== 'undefined' && 'ontouchstart' in window;

  if (reducedMotion) {
    // Static fallback. Swap this for a real gradient/image asset before
    // shipping — a flat color is a placeholder, not the final fallback.
    return (
      <div ref={containerRef} style={{ width: '100%', height: '100%', backgroundColor }} />
    );
  }

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
      <Suspense fallback={null}>
        <ReactBitsComponent
          colors={colors}
          backgroundColor={backgroundColor}
          paused={!inView}
          dpr={dpr}
          mouseInteraction={!isTouch}
        />
      </Suspense>
    </div>
  );
}
