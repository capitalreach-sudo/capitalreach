"use client";

import { useEffect, useRef } from "react";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  born: number;
  size: number;
  alpha: number;
}

const MAX_PARTICLES = 12;
const LIFETIME_MS   = 900;

export function HeroParticles({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particles = useRef<Particle[]>([]);
  const rafId     = useRef<number>(0);
  const reduced   = useRef(false);

  useEffect(() => {
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced.current) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Size canvas to its parent
    const parent = canvas.parentElement;
    if (!parent) return;

    const resize = () => {
      canvas.width  = parent.offsetWidth;
      canvas.height = parent.offsetHeight;
    };
    resize();

    const ro = new ResizeObserver(resize);
    ro.observe(parent);

    // Spawn particle on mouse move
    const onMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      if (particles.current.length >= MAX_PARTICLES) {
        particles.current.shift();
      }

      particles.current.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 0.8,
        vy: -Math.random() * 1.2 - 0.3,
        born: performance.now(),
        size: Math.random() * 3 + 2,
        alpha: 1,
      });
    };

    canvas.addEventListener("mousemove", onMove);
    // Also listen on the parent so coverage extends to the full hero
    parent.addEventListener("mousemove", onMove);

    // Render loop
    const render = (now: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particles.current = particles.current.filter(p => {
        const age = now - p.born;
        if (age >= LIFETIME_MS) return false;

        const progress = age / LIFETIME_MS;
        p.alpha = 1 - progress;
        p.x    += p.vx;
        p.y    += p.vy;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1 - progress * 0.4), 0, Math.PI * 2);
        // Copper: #B5651D with alpha
        ctx.fillStyle = `rgba(181,101,29,${p.alpha * 0.7})`;
        ctx.fill();

        return true;
      });

      rafId.current = requestAnimationFrame(render);
    };

    rafId.current = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(rafId.current);
      ro.disconnect();
      canvas.removeEventListener("mousemove", onMove);
      parent.removeEventListener("mousemove", onMove);
    };
  }, []);

  if (typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return null;
  }

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={className}
      style={{
        position:      "absolute",
        inset:         0,
        pointerEvents: "none",
        zIndex:        0,
      }}
    />
  );
}
