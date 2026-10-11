/** Design tokens, taken from the EduPulse-style reference: navy header, white rounded cards on light gray, dark pill tab bar. */
export const colors = {
  navy: "#0E1B45",        // tab bar, strongest text
  blue: "#2347D6",        // primary
  blueDeep: "#162E96",    // gradient start
  blueSoft: "#E8EDFD",
  bg: "#F1F3F8",          // screen background
  card: "#FFFFFF",
  text: "#121A33",
  muted: "#6B7494",
  border: "#E3E7F1",
  success: "#12875A", successSoft: "#E1F5EC",
  warning: "#B66A00", warningSoft: "#FFF1D6",
  danger: "#C73A3A", dangerSoft: "#FDE8E8",
  violet: "#6A47D6", violetSoft: "#ECE7FB",
  teal: "#0C8A9A", tealSoft: "#DFF4F7",
  orange: "#D9622B", orangeSoft: "#FCE9DF",
  white: "#FFFFFF",
};
export const radius = { sm: 12, md: 18, lg: 24, pill: 999 };
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const shadow = { shadowColor: "#0E1B45", shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 3 } as const;
export const type = {
  title: { fontSize: 24, fontWeight: "800" as const, color: colors.text },
  h2: { fontSize: 17, fontWeight: "700" as const, color: colors.text },
  body: { fontSize: 15, color: colors.text },
  small: { fontSize: 13, color: colors.muted },
};
