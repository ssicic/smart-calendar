// The app's look in one place: colours, fonts and corner shapes.
// "Calm & soft": warm linen background, warm charcoal text, sage green as the
// main colour, muted tones for everything else. Screens use these names, never
// raw hex values, so the whole look can change here.

export const colors = {
  // Surfaces
  bg: "#F6F3EE", // the screen behind everything
  white: "#FFFFFF", // sheets, cards, text on coloured buttons
  panel: "#F9F7F3", // light boxes inside a sheet
  surfaceAlt: "#EFEBE5", // chips, tracks, quiet buttons, hour lines
  border: "#E6E0D7",
  borderStrong: "#D6CEC3",
  backdrop: "rgba(52,48,43,0.35)", // behind a sheet

  // Text
  text: "#34302B",
  textSoft: "#57514A",
  textMuted: "#857D73",
  textFaint: "#ADA59B",
  textFainter: "#CFC8BE", // days of the next/previous month

  // Main colour (sage)
  accent: "#7C9885",
  accentStrong: "#4F6B58",
  accentSoft: "#E7EFE9",

  // Meaning
  success: "#6E9E78",
  successStrong: "#4E7A58",
  successSoft: "#EAF3EC",
  successBorder: "#CFE3D4",
  danger: "#B8655B",
  dangerSoft: "#F6E3DF",
  warnText: "#8C6230",
  warnSoft: "#F7ECD8",

  // Calendar
  now: "#D97B66", // the red-ish now-line and today's date
  todayTint: "#F1F4EF", // today's column
  routine: "#C9935A",
  routineStrong: "#9A6A35",
  routineSoft: "#F7EBDD",
  fixedBg: "#EEEAE4",
  fixedBar: "#9B9186",
  lockedBg: "#DCE7DF",
  doneBg: "#F2EFEA",
  doneBar: "#B9B1A7",
  sleep: "#ECE9F0", // before wake-up and after bedtime
  windDown: "#F3F1F5",
  sleepLabel: "#9690A3",
};

/** Year view heatmap: nothing → a lot. */
export const heatShades = ["#EFEBE5", "#DCE7DF", "#BCD2C3", "#97B6A2", "#7C9885"];

/** Nunito, a soft rounded font, loaded in App.tsx. Use these instead of fontWeight. */
export const font = {
  regular: "Nunito_400Regular",
  medium: "Nunito_500Medium",
  semibold: "Nunito_600SemiBold",
  bold: "Nunito_700Bold",
  heavy: "Nunito_800ExtraBold",
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
