/** Line icons (24px grid, 1.8 stroke), drawn for this app in the style of open icon sets. */
import type { ReactNode } from "react";

const PATHS: Record<string, ReactNode> = {
  home: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V20h14V9.5" /><path d="M10 20v-6h4v6" /></>,
  chart: <><path d="M4 20V4" /><path d="M4 20h16" /><rect x="7" y="11" width="3" height="6" rx="0.5" /><rect x="12" y="7" width="3" height="10" rx="0.5" /><rect x="17" y="13" width="3" height="4" rx="0.5" /></>,
  map: <><path d="m9 4-6 2.5v13.5l6-2.5 6 2.5 6-2.5V4l-6 2.5z" /><path d="M9 4v13.5" /><path d="M15 6.5V20" /></>,
  school: <><path d="M12 3 2 8l10 5 10-5z" /><path d="M6 10.2V16c0 1.5 2.7 3 6 3s6-1.5 6-3v-5.8" /><path d="M22 8v6" /></>,
  drop: <><path d="M12 3s6 6.4 6 11a6 6 0 0 1-12 0c0-4.6 6-11 6-11z" /><path d="M9.5 15a2.5 2.5 0 0 0 2.5 2.5" /></>,
  bamboo: <><path d="M9 21V3" /><path d="M9 8h0M9 14h0" /><path d="M7.5 8h3M7.5 14h3" /><path d="M15 21V6" /><path d="M13.5 11h3M13.5 17h3" /><path d="M9 6c2-2 4.5-2.5 6.5-2" /><path d="M15 9c1.5-1.6 3.5-2 5-1.8" /></>,
  tree: <><path d="M12 21v-6" /><path d="M12 15c-4 0-7-2.2-7-5.5C5 6.4 8 4 12 3c4 1 7 3.4 7 6.5 0 3.3-3 5.5-7 5.5z" /><path d="m12 11-2.5-2M12 13l3-2.5" /></>,
  shield: <><path d="M12 3 4 6v6c0 4.6 3.4 8 8 9 4.6-1 8-4.4 8-9V6z" /><path d="m9 12 2 2 4-4" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.6-3.6 3.3-6 6.5-6s5.9 2.4 6.5 6" /><circle cx="17" cy="9" r="2.5" /><path d="M17 14c2.5 0 4.2 1.8 4.6 4.5" /></>,
  phone: <><rect x="6" y="2.5" width="12" height="19" rx="2.5" /><path d="M11 18h2" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  logout: <><path d="M15 4h4v16h-4" /><path d="M10 8l-4 4 4 4" /><path d="M6 12h10" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3c2.5 2.6 3.7 5.6 3.7 9s-1.2 6.4-3.7 9c-2.5-2.6-3.7-5.6-3.7-9S9.5 5.6 12 3z" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  upload: <><path d="M12 15V4" /><path d="m7 9 5-5 5 5" /><path d="M4 15v5h16v-5" /></>,
  wrench: <><path d="M14.7 6.3a4 4 0 0 0-5.4 5.1L4 16.7 7.3 20l5.3-5.3a4 4 0 0 0 5.1-5.4l-2.6 2.6-2.5-.6-.6-2.5z" /></>,
  check: <><path d="m5 12.5 4.5 4.5L19 7.5" /></>,
  arrow: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
  menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
  database: <><ellipse cx="12" cy="5.5" rx="7.5" ry="2.5" /><path d="M4.5 5.5v13c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5v-13" /><path d="M4.5 12c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5" /></>,
  layers: <><path d="m12 3 9 5-9 5-9-5z" /><path d="m3 13 9 5 9-5" /></>,
  sparkle: <><path d="M12 3v4M12 17v4M3 12h4M17 12h4" /><path d="m6 6 2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" /></>,
  calendar: <><rect x="3.5" y="5" width="17" height="15.5" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
  coins: <><ellipse cx="9" cy="7" rx="6" ry="3" /><path d="M3 7v5c0 1.7 2.7 3 6 3s6-1.3 6-3V7" /><path d="M9 15v2c0 1.7 2.7 3 6 3s6-1.3 6-3v-5c0-1.7-2.7-3-6-3" /></>,
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20, className }: { name: IconName | string; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
      {PATHS[name] ?? PATHS.layers}
    </svg>
  );
}

/** The EU flag (12 gold stars on blue), as used on "Funded by the European Union" marks. */
export function EuFlag({ width = 36 }: { width?: number }) {
  const stars = Array.from({ length: 12 }, (_, i) => {
    const a = (i * Math.PI) / 6;
    return [30 + 13.3 * Math.sin(a), 20 - 13.3 * Math.cos(a)] as const;
  });
  return (
    <svg width={width} height={(width * 2) / 3} viewBox="0 0 60 40" aria-hidden style={{ flex: "none", borderRadius: 2 }}>
      <rect width="60" height="40" fill="#003399" />
      {stars.map(([x, y], i) => (
        <polygon key={i} fill="#FFCC00" points={star(x, y, 2.2)} />
      ))}
    </svg>
  );
}

function star(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 === 0 ? r : r * 0.4;
    const a = (i * Math.PI) / 5 - Math.PI / 2;
    pts.push(`${(cx + rr * Math.cos(a)).toFixed(2)},${(cy + rr * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(" ");
}

export const STREAM_ICON: Record<string, IconName> = { schools: "school", boreholes: "drop", bamboo: "bamboo", miombo: "tree", platform: "shield" };
