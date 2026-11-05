// The app's look in one place: colours, fonts and corner shapes.
// Warm off-white background, warm charcoal text, one deep teal green as the
// main colour (solid for the main action, today and the now-line), clear
// group colours, neutral everything else. Screens use these names, never
// raw hex values, so the whole look can change here.

export const colors = {
  // Surfaces
  bg: "#FBF8F3", // the screen behind everything
  white: "#FFFFFF", // sheets, cards, text on coloured buttons
  panel: "#F7F3EC", // light boxes inside a sheet
  surfaceAlt: "#F1ECE4", // chips, tracks, quiet buttons, hour lines
  border: "#ECE6DD",
  borderStrong: "#D9D1C5",
  backdrop: "rgba(34,32,28,0.38)", // behind a sheet

  // Text
  text: "#22201C",
  textSoft: "#4A453F",
  textMuted: "#76706A",
  textFaint: "#ADA59B",
  textFainter: "#CFC8BE", // days of the next/previous month

  // Main colour (teal green)
  accent: "#0F6E6E",
  accentStrong: "#0A5454",
  accentSoft: "#E1F0EE",

  // Meaning
  success: "#3A9466",
  successStrong: "#25704A",
  successSoft: "#E6F3EA",
  successBorder: "#C8E3D2",
  danger: "#B8655B",
  dangerSoft: "#F6E3DF",
  warnText: "#8C6230",
  warnSoft: "#F7ECD8",

  // Calendar
  now: "#D97B66", // the red-ish now-line and today's date
  todayTint: "#EEF5F3", // today's column
  routine: "#C9935A",
  routineStrong: "#9A6A35",
  routineSoft: "#F7EBDD",
  fixedBg: "#EEEAE4",
  fixedBar: "#9B9186",
  lockedBg: "#D5E8E5",
  doneBg: "#F2EFEA",
  doneBar: "#B9B1A7",
  sleep: "#ECE9F0", // before wake-up and after bedtime
  windDown: "#F3F1F5",
  sleepLabel: "#9690A3",
};

/** Year view heatmap: nothing → a lot. */
export const heatShades = ["#F1ECE4", "#D5E8E5", "#A9D0CB", "#5FA3A0", "#0F6E6E"];

/**
 * Fonts loaded in App.tsx; use these instead of fontWeight. DM Sans for text,
 * Bricolage Grotesque (`display`) for screen and sheet titles and big numbers.
 */
export const font = {
  regular: "DMSans_400Regular",
  medium: "DMSans_500Medium",
  semibold: "DMSans_600SemiBold",
  bold: "DMSans_700Bold",
  heavy: "DMSans_800ExtraBold",
  display: "BricolageGrotesque_700Bold",
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  sheet: 24,
};

/** Soft shadows (web and new React Native both understand boxShadow). */
export const shadow = {
  subtle: "0 1px 2px rgba(52,48,43,0.10)",
  raised: "0 6px 16px rgba(52,48,43,0.16)",
};
