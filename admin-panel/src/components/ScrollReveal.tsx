'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Reveals its children with a light fade+rise as they scroll into view, once -- not a
 * continuous scroll-linked effect, and it never re-hides/re-plays if the admin scrolls back up
 * and down again (IntersectionObserver is disconnected after the first reveal). Kept subtle
 * (12px rise, 0.4s) so it reads as "the page settling in", not a slideshow -- meant for a
 * page's top-level sections, not every individual label/icon.
 */
export function ScrollReveal({
  children,
  delayMs = 150,
  className = '',
}: {
  children: ReactNode;
  delayMs?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    // Elements already on screen at load (e.g. above the fold) reveal immediately rather than
    // waiting on a scroll event that may never come.
    // A generous negative bottom margin means a section has to be scrolled meaningfully into
    // the viewport (not just barely peeking in) before it reveals -- otherwise, on a tall
    // monitor where most sections are already close to on-screen at load, this fires almost
    // immediately and never reads as "triggered by scrolling."
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.2, rootMargin: '0px 0px -220px 0px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? 'translateY(0)' : 'translateY(24px)',
        transition: `opacity 0.65s cubic-bezier(0.16, 1, 0.3, 1) ${delayMs}ms, transform 0.65s cubic-bezier(0.16, 1, 0.3, 1) ${delayMs}ms`,
      }}
    >
      {children}
    </div>
  );
}
