/**
 * A 64×20 trend line: normalised points in, one polyline out. The endpoint
 * dot and the slope colour (up = green, down = red, flat = ink) are the only
 * emphasis — a sparkline is read in half a second or not at all.
 */
export function Sparkline({ points, width = 64, height = 20 }: {
  points: number[]; width?: number; height?: number;
}) {
  if (points.length < 4) return null;
  const pad = 2;
  const step = (width - pad * 2) / (points.length - 1);
  const y = (v: number) => pad + (1 - v) * (height - pad * 2);
  const path = points.map((v, i) => `${pad + i * step},${y(v).toFixed(1)}`).join(" ");
  const slope = points[points.length - 1] - points[0];
  const color = slope > 0.05 ? "var(--cr-up)" : slope < -0.05 ? "var(--cr-down)" : "var(--cr-ink-4)";
  const lastX = pad + (points.length - 1) * step;
  const lastY = y(points[points.length - 1]);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden style={{ flexShrink: 0, display: "block" }}>
      <polyline points={path} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" opacity="0.85"
        pathLength={1} strokeDasharray={1} strokeDashoffset={1}
        style={{ animation: "sparkDraw 700ms ease-out forwards" }} />
      <circle cx={lastX} cy={lastY} r="2" fill={color}
        style={{ opacity: 0, animation: "sparkDot 200ms ease 600ms forwards" }} />
    </svg>
  );
}
