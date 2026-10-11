/** Design tokens, following the EduPulse-style reference: navy header, white rounded cards on light gray, dark pill tab bar. */
export const colors = {
  navy: "#0E1B45",        // tab bar, strongest text
  blue: "#2347D6",        // primary
  blueDeep: "#162E96",    // header gradient start
  blueSoft: "#E8EDFD",
  bg: "#F3F5FA",          // screen background
  card: "#FFFFFF",
  text: "#121A33",
  textSoft: "#3A4465",
  muted: "#6B7494",
  border: "#E4E8F2",
  success: "#12875A", successSoft: "#E1F5EC",
  warning: "#B66A00", warningSoft: "#FFF1D6",
  danger: "#C73A3A", dangerSoft: "#FDE8E8",
  violet: "#6A47D6", violetSoft: "#ECE7FB",
  teal: "#0C8A9A", tealSoft: "#DFF4F7",
  orange: "#D9622B", orangeSoft: "#FCE9DF",
  white: "#FFFFFF",
  onBlueMuted: "#C9D4FF",
};
export const radius = { sm: 12, md: 18, lg: 24, pill: 999 };
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const shadow = { shadowColor: "#0E1B45", shadowOpacity: 0.07, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2 } as const;

/** One type scale for the whole app: display > title > heading > body > caption. Numbers use tabular figures so columns line up. */
export const type = {
  display: { fontSize: 28, lineHeight: 34, fontWeight: "800" as const, color: colors.text, letterSpacing: -0.4 },
  title: { fontSize: 22, lineHeight: 28, fontWeight: "800" as const, color: colors.text, letterSpacing: -0.3 },
  h2: { fontSize: 16, lineHeight: 22, fontWeight: "700" as const, color: colors.text },
  body: { fontSize: 15, lineHeight: 21, color: colors.text },
  small: { fontSize: 13, lineHeight: 18, color: colors.muted },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: "600" as const, color: colors.muted, letterSpacing: 0.3 },
  number: { fontSize: 22, lineHeight: 28, fontWeight: "800" as const, color: colors.text, fontVariant: ["tabular-nums" as const] },
};
export const MIN_TOUCH = 44;
