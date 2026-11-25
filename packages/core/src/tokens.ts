/**
 * Design tokens shared by the web app and the Android app.
 * Colours are provisional, sampled from the GoCongo logo, until the brand kit arrives.
 */
export const colors = {
  gcGreen: "#1C6B33",
  gcLime: "#AFC437",
  gcYellow: "#E8D72C",
  gcOrange: "#E8A827",
  euBlue: "#003399",
  euYellow: "#FFCC00",
  text: "#1A1A1A",
  textMuted: "#5A5A5A",
  surface: "#FFFFFF",
  surfaceAlt: "#F3F5F1",
  border: "#D5DAD2",
  statusGood: "#1C6B33",
  statusWarning: "#B26B00",
  statusCritical: "#B3261E",
} as const;

/** One accent per stream; paired with an icon and a word, never colour alone. */
export const streamAccent = {
  schools: colors.gcYellow,
  bamboo: colors.gcLime,
  miombo: colors.gcOrange,
  boreholes: "#2B7BB9",
  platform: colors.gcGreen,
} as const;

export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;
export const radius = { sm: 4, md: 8, lg: 16 } as const;
/** Minimum sizes for field use on low-end phones. */
export const touch = { minTarget: 48, bodyText: 16 } as const;
