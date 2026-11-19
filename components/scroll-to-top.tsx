"use client";

import { useEffect } from "react";

/** Scrolls the window to the top when it mounts. Used after submitting the application,
 *  where the page swaps the long form for the confirmation while scrolled to the bottom. */
export function ScrollToTop() {
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, []);
  return null;
}
