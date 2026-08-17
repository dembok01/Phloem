"use client";

import * as React from "react";
import { useReducedMotion } from "motion/react";

/**
 * True when motion should be suppressed for this reader.
 *
 * Covers BOTH `prefers-reduced-motion` and the app's own elderly mode. The
 * global guards in `globals.css` neutralise CSS transitions and animations with
 * `!important` longhands, but Motion drives its animations from JavaScript
 * (WAAPI / rAF) — those rules cannot reach it. Any Motion-powered component
 * therefore has to opt out here explicitly, or elderly mode would silently stop
 * being motion-free the moment we introduced a spring.
 *
 * `.elderly` is stamped onto <html> from an effect in `ElderlyMode`, i.e. after
 * this hook's first render, so the class is observed rather than read once.
 */
export function useCalmMotion(): boolean {
  const systemReduced = useReducedMotion();
  const [elderly, setElderly] = React.useState(false);

  React.useEffect(() => {
    const root = document.documentElement;
    const read = () => setElderly(root.classList.contains("elderly"));
    read();
    const observer = new MutationObserver(read);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return Boolean(systemReduced) || elderly;
}
