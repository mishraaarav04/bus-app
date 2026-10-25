// RouteIQ: warm orange, big rounded shapes, map-first screens.
export const colors = {
  primary: "#FF7A1A",
  primaryDark: "#E5600A",
  primarySoft: "#FFEFE2",
  primaryTint: "#FFD9BC",
  ink: "#231A14",
  muted: "#7A6A5E",
  line: "#F1E4D8",
  bg: "#FFFFFF",
  surface: "#FFF9F4",
  success: "#1FA35C",
  successSoft: "#E4F6EC",
  danger: "#E5484D",
  dangerSoft: "#FDEBEC",
  warning: "#E89A0C",
  warningSoft: "#FFF3D6",
  white: "#FFFFFF",
};

export const radius = { sm: 10, md: 16, lg: 24, xl: 32, pill: 999 };

export const shadow = {
  shadowColor: "#7A3A00",
  shadowOpacity: 0.16,
  shadowRadius: 18,
  shadowOffset: { width: 0, height: 6 },
  elevation: 8,
};

export const font = {
  title: { fontSize: 26, fontWeight: "800" as const, color: colors.ink },
  h2: { fontSize: 19, fontWeight: "800" as const, color: colors.ink },
  h3: { fontSize: 16, fontWeight: "700" as const, color: colors.ink },
  body: { fontSize: 15, color: colors.ink },
  small: { fontSize: 13, color: colors.muted },
};

export function formatEta(sec: number | null | undefined): string {
  if (sec == null) return "-";
  const m = Math.max(0, Math.round(sec / 60));
  if (m < 1) return "<1 min";
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

export function formatDuration(sec: number | undefined): string {
  return sec == null ? "-" : formatEta(sec);
}

export function formatMiles(meters: number | undefined): string {
  return meters == null ? "-" : `${(meters / 1609.34).toFixed(1)} mi`;
}

// Bus sizes are entered in feet / pounds (US) and stored in metres / metric tons.
export const ftToM = (ft: number) => Math.round(ft * 0.3048 * 100) / 100;
export const mToFt = (m: number) => Math.round((m / 0.3048) * 10) / 10;
export const lbToT = (lb: number) => Math.round(lb * 0.000453592 * 10) / 10;
export const tToLb = (t: number) => Math.round(t / 0.000453592 / 100) * 100;
