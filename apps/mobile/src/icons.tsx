import { colors } from "@eu/core/tokens";
import { memo, type ReactNode } from "react";
import Svg, { Circle, Ellipse, Path, Rect } from "react-native-svg";

/**
 * Line icons on a 24 grid with a 1.9 stroke: the same drawings as the web app
 * (apps/web/components/icons.tsx), so both read as one product. Emoji were dropped because cheap
 * Android phones draw them inconsistently or not at all.
 */
const PATHS = {
  school: <><Path d="M12 3 2 8l10 5 10-5z" /><Path d="M6 10.2V16c0 1.5 2.7 3 6 3s6-1.5 6-3v-5.8" /><Path d="M22 8v6" /></>,
  drop: <><Path d="M12 3s6 6.4 6 11a6 6 0 0 1-12 0c0-4.6 6-11 6-11z" /><Path d="M9.5 15a2.5 2.5 0 0 0 2.5 2.5" /></>,
  bamboo: <><Path d="M9 21V3" /><Path d="M7.5 8h3M7.5 14h3" /><Path d="M15 21V6" /><Path d="M13.5 11h3M13.5 17h3" /><Path d="M9 6c2-2 4.5-2.5 6.5-2" /><Path d="M15 9c1.5-1.6 3.5-2 5-1.8" /></>,
  tree: <><Path d="M12 21v-6" /><Path d="M12 15c-4 0-7-2.2-7-5.5C5 6.4 8 4 12 3c4 1 7 3.4 7 6.5 0 3.3-3 5.5-7 5.5z" /><Path d="m12 11-2.5-2M12 13l3-2.5" /></>,
  users: <><Circle cx="9" cy="8" r="3.5" /><Path d="M2.5 20c.6-3.6 3.3-6 6.5-6s5.9 2.4 6.5 6" /><Circle cx="17" cy="9" r="2.5" /><Path d="M17 14c2.5 0 4.2 1.8 4.6 4.5" /></>,
  clipboard: <><Rect x="5" y="4.5" width="14" height="16.5" rx="2" /><Path d="M9 4.5V3h6v1.5" /><Path d="m8.5 12.5 2.2 2.2 4.8-4.7" /></>,
  coins: <><Ellipse cx="9" cy="7" rx="6" ry="3" /><Path d="M3 7v5c0 1.7 2.7 3 6 3s6-1.3 6-3V7" /><Path d="M9 15v2c0 1.7 2.7 3 6 3s6-1.3 6-3v-5c0-1.7-2.7-3-6-3" /></>,
  wrench: <Path d="M14.7 6.3a4 4 0 0 0-5.4 5.1L4 16.7 7.3 20l5.3-5.3a4 4 0 0 0 5.1-5.4l-2.6 2.6-2.5-.6-.6-2.5z" />,
  sprout: <><Path d="M12 21v-8" /><Path d="M12 13c0-4-3-6-7-6 0 4 3 6 7 6z" /><Path d="M12 11c0-3.5 2.5-6 6.5-6 0 3.5-2.5 6-6.5 6z" /></>,
  calendar: <><Rect x="3.5" y="5" width="17" height="15.5" rx="2" /><Path d="M3.5 10h17M8 3v4M16 3v4" /></>,
  check: <Path d="m5 12.5 4.5 4.5L19 7.5" />,
  x: <Path d="M6 6l12 12M18 6 6 18" />,
  plus: <Path d="M12 5v14M5 12h14" />,
  minus: <Path d="M5 12h14" />,
  back: <><Path d="M20 12H5" /><Path d="m11 6-6 6 6 6" /></>,
  chevronRight: <Path d="m9 6 6 6-6 6" />,
  chevronDown: <Path d="m6 9 6 6 6-6" />,
  settings: <><Circle cx="12" cy="12" r="3" /><Path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" /></>,
  chevronLeft: <Path d="m15 6-6 6 6 6" />,
  lock: <><Rect x="5" y="10.5" width="14" height="10" rx="2" /><Path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" /></>,
  sync: <><Path d="M4 12a8 8 0 0 1 13.7-5.6L20 8.5" /><Path d="M20 4v4.5h-4.5" /><Path d="M20 12a8 8 0 0 1-13.7 5.6L4 15.5" /><Path d="M4 20v-4.5h4.5" /></>,
  cloudOk: <><Path d="M7 18.5a4.5 4.5 0 0 1-.6-9 6 6 0 0 1 11.5 1.6A3.8 3.8 0 0 1 17.5 18.5z" /><Path d="m9.5 13.5 2 2 3.5-3.5" /></>,
  cloudOff: <><Path d="M7 18.5a4.5 4.5 0 0 1-.6-9 6 6 0 0 1 2-3" /><Path d="M12.5 5.1a6 6 0 0 1 5.4 6A3.8 3.8 0 0 1 19.9 18" /><Path d="m3 3 18 18" /></>,
  locate: <><Circle cx="12" cy="12" r="6.5" /><Circle cx="12" cy="12" r="2" /><Path d="M12 2v3.5M12 18.5V22M2 12h3.5M18.5 12H22" /></>,
  pin: <><Path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z" /><Circle cx="12" cy="10" r="2.3" /></>,
  camera: <><Path d="M4 8.5h3.2L9 6h6l1.8 2.5H20v11H4z" /><Circle cx="12" cy="13.5" r="3.5" /></>,
  alert: <><Path d="M12 4 2.8 19.5h18.4z" /><Path d="M12 10v4.5M12 17.2v.1" /></>,
  info: <><Circle cx="12" cy="12" r="9" /><Path d="M12 11v5.5M12 7.8v.1" /></>,
  search: <><Circle cx="11" cy="11" r="6.5" /><Path d="m16 16 4.5 4.5" /></>,
  compass: <><Circle cx="12" cy="12" r="9" /><Path d="m15.5 8.5-2 5-5 2 2-5z" /></>,
  receipt: <><Path d="M6 3h12v18l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4L6 21z" /><Path d="M9 8h6M9 12h6M9 16h3" /></>,
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof PATHS;

export const Icon = memo(function Icon({ name, size = 24, color = colors.text, strokeWidth = 1.9 }: { name: IconName; size?: number; color?: string; strokeWidth?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      {PATHS[name]}
    </Svg>
  );
});
