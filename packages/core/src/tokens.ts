/**
 * Design tokens shared by the web app and the Android app.
 * GoCongo (gocongo.cd: green #1A6B33, orange #EBAC27, Inter Tight) crossed with EU Global Gateway
 * (EU blue #003399, gold #FFCC00). Provisional until the brand kit arrives.
 * The web mirrors these as CSS variables in apps/web/app/globals.css; keep the two in step.
 */
export const colors = {
  gcGreen: "#1A6B33",
  gcGreenDark: "#124A23",
  gcGreenDeep: "#0E3519",
  gcGreenTint: "#EAF3EA",
  gcLime: "#AFC437",
  gcYellow: "#E8D72C",
  gcOrange: "#EBAC27",
  euBlue: "#003399",
  euBlueTint: "#E8EEFA",
  euYellow: "#FFCC00",
  text: "#18231B",
  textMuted: "#5B665D",
  surface: "#FFFFFF",
  surfaceAlt: "#F3F5F1",
  border: "#DFE5DB",
  statusGood: "#1A6B33",
  statusWarning: "#B26B00",
  /** Warning colour for small text: #B26B00 is only 4.2:1 on white, too faint outdoors. */
  statusWarningText: "#8A5300",
  statusCritical: "#B3261E",
  statusInfo: "#2B6CB0",
} as const;

/** One accent per stream; paired with an icon and a word, never colour alone. */
export const streamAccent = {
  schools: "#C9A400",
  bamboo: "#7FA02B",
  miombo: "#D9861A",
  boreholes: "#2B7BB9",
  platform: colors.gcGreen,
} as const;

export const font = { family: "Inter Tight", fallback: "Arial, sans-serif" } as const;
/**
 * Type scale (px on web, dp on Android), shared so both apps read as one product.
 * Android has no variable weights for bundled fonts, so the phone picks a font file per weight.
 */
export const type = {
  display: { size: 28, line: 34, weight: 800 },
  title: { size: 22, line: 28, weight: 700 },
  heading: { size: 18, line: 24, weight: 700 },
  body: { size: 16, line: 23, weight: 400 },
  label: { size: 14, line: 19, weight: 600 },
  small: { size: 13, line: 18, weight: 400 },
} as const;
export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;
export const radius = { sm: 6, md: 10, lg: 16 } as const;
/** Minimum sizes for field use on low-end phones. */
export const touch = { minTarget: 48, bodyText: 16 } as const;
