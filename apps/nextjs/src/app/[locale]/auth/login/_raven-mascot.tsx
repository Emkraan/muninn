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
    const GESTURES = ["peck", "hop", "look", "caw", "preen"] as const;
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
      // Wings flap for the whole trip -> reads as flying, not sliding.
      el.dataset.flying = "1";
      delete el.dataset.action;
      el.style.transform = `translate3d(${tx}px, ${ty}px, 0) scaleX(${dir})`;
      x = tx;
      gestureTimer = window.setTimeout(() => {
        if (!alive) return;
        delete el.dataset.flying; // landed
        if (Math.random() < 0.75) {
          const gesture = GESTURES[Math.floor(Math.random() * GESTURES.length)];
          if (gesture) el.dataset.action = gesture;
          clearTimer = window.setTimeout(() => {
            if (alive) delete el.dataset.action;
          }, 1400);
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
            {/* Volumetric fill: top-left key light -> shadowed base, for a 3D read. */}
            <radialGradient id="ravenVol" cx="34%" cy="28%" r="85%">
              <stop offset="0%" stopColor="#7CC0F0" />
              <stop offset="52%" stopColor="#2E86C8" />
              <stop offset="100%" stopColor="#124F7E" />
            </radialGradient>
          </defs>
          {/* Raven cues: heavy hooked dagger bill, shaggy throat hackles, long wedge tail. */}
          <path className={classes.ravenTail} d="M34 56 L2 70 L11 71 L5 76 L15 74 L13 80 L34 66 Z" fill="url(#ravenGrad)" />
          <path className={classes.ravenWingR} d="M40 42 C28 38 18 47 24 58 C33 54 41 54 50 50 Z" fill="#124F7E" />
          <ellipse cx="50" cy="55" rx="26" ry="12.5" fill="url(#ravenVol)" transform="rotate(-8 50 55)" />
          {/* specular sheen on the back */}
          <ellipse cx="43" cy="50" rx="11" ry="4.2" fill="#BFE2FB" opacity="0.35" transform="rotate(-12 43 50)" />
          <path
            className={classes.ravenWingL}
            d="M54 44 C71 39 83 48 74 61 C64 62 58 60 50 52 C59 54 63 51 60 47 Z"
            fill="url(#ravenGrad)"
          />
          <g className={classes.ravenHead}>
            <path
              d="M61 41 C61 32 69 28 76 31 C81 33 82 40 79 44 C76 48 68 49 63 47 C61 46 61 43 61 41 Z"
              fill="url(#ravenVol)"
            />
            <path d="M77 35 L98 37 C99.5 37.4 99.5 39 98 39.6 L95 40 L96.5 42.5 L92.5 41.5 L78 45 Z" fill="#155A95" />
            <path d="M63 47 L65 53 L68 48 L71 54 L74 49 L76 55 L78 49 L79 52 L64 51 Z" fill="#155A95" />
            <circle className={classes.ravenEye} cx="71" cy="38" r="2.3" fill="#0B1220" />
          </g>
          <path
            d="M46 66 L44 78 M44 78 L41 80 M44 78 L47 80 M58 66 L61 80 M61 80 L58 82 M61 80 L64 82"
            stroke="#155A95"
            strokeWidth="2"
            strokeLinecap="round"
            fill="none"
          />
        </svg>
      </div>
    </div>
  );
};
