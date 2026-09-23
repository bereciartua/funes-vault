"use client";

import { useEffect, useRef, useState } from "react";

export function countUpEase(progress: number) {
  const clamped = Math.min(1, Math.max(0, progress));

  return 1 - Math.pow(1 - clamped, 3);
}

export function useCountUp(target: number, duration = 1100) {
  const [value, setValue] = useState(target);
  const previous = useRef(target);

  useEffect(() => {
    const from = previous.current;
    previous.current = target;
    const reduced = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    if (reduced || from === target) {
      setValue(target);

      return;
    }

    const started = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / duration);
      setValue(Math.round(from + (target - from) * countUpEase(progress)));
      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      }
    };
    frame = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frame);
  }, [duration, target]);

  return value;
}
