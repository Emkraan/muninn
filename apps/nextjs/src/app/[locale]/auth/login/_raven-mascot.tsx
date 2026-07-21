"use client";

import { useEffect, useRef } from "react";

import classes from "./login.module.css";

// Ambient Muninn raven that idles (bob/blink/wing-flutter) and periodically
// wanders to safe waypoints in the page gutters doing a one-shot gesture.
// Pure transform/opacity, GPU-composited, and fully disabled (static perch)
// under prefers-reduced-motion.
export const RavenMascot = () => {
  const penRef = useRef<HTMLDivElement>(null);
  const ravenRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const pen = penRef.current;
    const el = ravenRef.current;
    if (!pen || !el) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.style.transform = "translate3d(24px, 70vh, 0)";
      return;
    }

    const SIZE = 72;
    const GESTURES = ["flap", "peck", "hop", "look"] as const;
    let x = 24;
    let alive = true;
    let moveTimer = 0;
    let gestureTimer = 0;
    let clearTimer = 0;
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);

    // Only wander where it will not overlap the card: retry random points,
    // else fall back to the far-left gutter.
    const pickTarget = () => {
      const width = pen.clientWidth;
      const height = pen.clientHeight;
      const card = pen.parentElement?.querySelector(`.${classes.authCard}`)?.getBoundingClientRect();
      for (let i = 0; i < 8; i++) {
        const tx = rnd(8, width - SIZE - 8);
        const ty = rnd(8, height - SIZE - 8);
        if (
          !card ||
          tx + SIZE < card.left - 24 ||
          tx > card.right + 24 ||
          ty + SIZE < card.top - 24 ||
          ty > card.bottom + 24
        ) {
          return { tx, ty };
        }
      }
      return { tx: rnd(8, Math.max(9, width * 0.12)), ty: rnd(8, height - SIZE - 8) };
    };

    const step = () => {
      if (!alive) return;
      const { tx, ty } = pickTarget();
      const dir = tx > x ? -1 : 1; // scaleX flip = face the travel direction
      const dur = rnd(1.8, 3.2);
      el.style.setProperty("--wander-dur", `${dur}s`);
      el.style.transform = `translate3d(${tx}px, ${ty}px, 0) scaleX(${dir})`;
      x = tx;
      gestureTimer = window.setTimeout(() => {
        if (!alive) return;
        if (Math.random() < 0.7) {
          const gesture = GESTURES[Math.floor(Math.random() * GESTURES.length)];
          if (gesture) el.dataset.action = gesture;
          clearTimer = window.setTimeout(() => {
            if (alive) delete el.dataset.action;
          }, 1300);
        }
        moveTimer = window.setTimeout(step, rnd(1500, 4000));
      }, dur * 1000);
    };

    el.style.transform = `translate3d(${x}px, 70vh, 0)`;
    moveTimer = window.setTimeout(step, 1200);
    return () => {
      alive = false;
      window.clearTimeout(moveTimer);
      window.clearTimeout(gestureTimer);
      window.clearTimeout(clearTimer);
    };
  }, []);

  return (
    <div ref={penRef} className={classes.ravenPlaypen} aria-hidden="true">
      <div ref={ravenRef} className={classes.ravenWander}>
        <svg className={classes.raven} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="ravenGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#4A9FE0" />
              <stop offset="100%" stopColor="#1B6FB8" />
            </linearGradient>
          </defs>
          <path className={classes.ravenTail} d="M20 58 L4 66 L22 66 Z" fill="url(#ravenGrad)" />
          <path className={classes.ravenWingR} d="M40 44 C30 40 22 46 26 56 C34 52 42 52 48 50 Z" fill="#155A95" />
          <ellipse cx="52" cy="54" rx="22" ry="14" fill="url(#ravenGrad)" />
          <path className={classes.ravenWingL} d="M56 44 C70 38 82 46 76 58 C66 52 58 52 52 50 Z" fill="url(#ravenGrad)" />
          <g className={classes.ravenHead}>
            <circle cx="70" cy="40" r="11" fill="url(#ravenGrad)" />
            <path d="M80 40 L94 38 L80 45 Z" fill="#155A95" />
            <circle className={classes.ravenEye} cx="72" cy="38" r="2.4" fill="#0B1220" />
          </g>
          <path d="M46 66 L44 78 L50 66 Z M58 66 L60 80 L64 66 Z" fill="#155A95" />
        </svg>
      </div>
    </div>
  );
};
