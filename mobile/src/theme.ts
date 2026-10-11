import type { TextStyle } from "react-native";

/**
 * Tapasok design tokens. One palette, one type scale, one spacing/radius/elevation scale for every screen.
 *
 * Identity: a deep university navy as the foundation (headers, hero panels, the tab bar), a confident royal blue for
 * actions, and a warm academic gold as the single accent (highlights, progress, "you" markers). Backgrounds are a cool
 * near-white so white cards read clearly. Semantic colours each have a solid, a soft fill and a dark "ink" for text on
 * the soft fill, so badges stay legible (all ink-on-soft pairs are above 4.5:1).
 */
export const colors = {
  // brand
  navy950: "#06122E",
  navy900: "#0A1A3F",
  navy800: "#10285F",
  navy700: "#183A84",
  primary: "#1F4FD8",
  primaryPressed: "#1A43BA",
  primarySoft: "#E9EFFE",
  primaryInk: "#163A9E",
  accent: "#F2B33D",
  accentSoft: "#FFF4DC",
  accentInk: "#7A4D00",

  // surfaces and text
  bg: "#F3F5FA",
  surface: "#FFFFFF",
  surfaceAlt: "#F7F8FC",
  border: "#E5E8F1",
  borderStrong: "#D3D9E6",
  text: "#0F1A35",
  textSecondary: "#46516F",
  textMuted: "#7A84A2",
  onDark: "#FFFFFF",
  onDarkMuted: "#B9C6EE",
  onDarkFaint: "rgba(255,255,255,0.14)",

  // semantic
  success: "#16A06A", successSoft: "#E3F6EE", successInk: "#0B6544",
  warning: "#E08A00", warningSoft: "#FFF2D9", warningInk: "#8A5300",
  danger: "#D64545", dangerSoft: "#FDECEC", dangerInk: "#A12C2C",
  info: "#2F7BEA", infoSoft: "#E6F0FE", infoInk: "#1B57AE",
  violet: "#6D4AE0", violetSoft: "#EFEAFD", violetInk: "#4A2DAF",
  teal: "#0E8C9B", tealSoft: "#E0F4F6", tealInk: "#0A6670",
};

export const gradients = {
  header: [colors.navy900, colors.navy800, colors.navy700] as const,
  hero: [colors.navy800, colors.primary] as const,
  gold: ["#F6C55E", "#E9A325"] as const,
};

export const space = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28, xxxl: 36 };
export const radius = { xs: 8, sm: 12, md: 16, lg: 22, xl: 28, pill: 999 };
export const MIN_TOUCH = 44;

/** Elevation: cards use `sm`, floating things (tab bar, sheets, toasts) use `lg`. */
export const elevation = {
  sm: { shadowColor: colors.navy900, shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  md: { shadowColor: colors.navy900, shadowOpacity: 0.1, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 5 },
  lg: { shadowColor: colors.navy950, shadowOpacity: 0.22, shadowRadius: 22, shadowOffset: { width: 0, height: 12 }, elevation: 12 },
} as const;

export const fonts = {
  regular: "PlusJakartaSans_400Regular",
  medium: "PlusJakartaSans_500Medium",
  semibold: "PlusJakartaSans_600SemiBold",
  bold: "PlusJakartaSans_700Bold",
  extrabold: "PlusJakartaSans_800ExtraBold",
};

const t = (fontFamily: string, fontSize: number, lineHeight: number, extra: TextStyle = {}): TextStyle => ({ fontFamily, fontSize, lineHeight, color: colors.text, ...extra });

/** Type scale. Use through <Txt variant="..."> so weight always comes from the font file, not a synthetic bold. */
export const typography = {
  display: t(fonts.extrabold, 30, 36, { letterSpacing: -0.6 }),
  h1: t(fonts.extrabold, 24, 30, { letterSpacing: -0.4 }),
  h2: t(fonts.bold, 18, 24, { letterSpacing: -0.2 }),
  h3: t(fonts.bold, 16, 22),
  body: t(fonts.regular, 15, 22),
  bodyStrong: t(fonts.semibold, 15, 22),
  small: t(fonts.medium, 13, 18, { color: colors.textSecondary }),
  smallStrong: t(fonts.bold, 13, 18),
  caption: t(fonts.bold, 11, 14, { letterSpacing: 0.8, textTransform: "uppercase", color: colors.textMuted }),
  label: t(fonts.semibold, 13, 18),
  number: t(fonts.extrabold, 22, 28, { fontVariant: ["tabular-nums"], letterSpacing: -0.3 }),
  numberLg: t(fonts.extrabold, 32, 38, { fontVariant: ["tabular-nums"], letterSpacing: -0.8 }),
  button: t(fonts.bold, 15, 20),
} satisfies Record<string, TextStyle>;
export type TypeVariant = keyof typeof typography;

/** Tones shared by icon chips, badges, banners and charts. */
export type Tone = "primary" | "accent" | "success" | "warning" | "danger" | "info" | "violet" | "teal" | "neutral";
export const tones: Record<Tone, { solid: string; soft: string; ink: string }> = {
  primary: { solid: colors.primary, soft: colors.primarySoft, ink: colors.primaryInk },
  accent: { solid: colors.accent, soft: colors.accentSoft, ink: colors.accentInk },
  success: { solid: colors.success, soft: colors.successSoft, ink: colors.successInk },
  warning: { solid: colors.warning, soft: colors.warningSoft, ink: colors.warningInk },
  danger: { solid: colors.danger, soft: colors.dangerSoft, ink: colors.dangerInk },
  info: { solid: colors.info, soft: colors.infoSoft, ink: colors.infoInk },
  violet: { solid: colors.violet, soft: colors.violetSoft, ink: colors.violetInk },
  teal: { solid: colors.teal, soft: colors.tealSoft, ink: colors.tealInk },
  neutral: { solid: colors.textMuted, soft: "#EEF0F6", ink: colors.textSecondary },
};

/** Room the floating tab bar needs at the bottom of scrolling content. */
export const TAB_BAR_SPACE = 124;
