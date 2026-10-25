export function formatEta(sec: number | null | undefined): string {
  if (sec == null) return "-";
  const m = Math.max(0, Math.round(sec / 60));
  if (m < 1) return "<1 min";
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}
export const formatMiles = (m?: number) => (m == null ? "-" : `${(m / 1609.34).toFixed(1)} mi`);
export const formatDuration = (s?: number) => (s == null ? "-" : formatEta(s));

// Bus sizes are entered in feet / pounds and stored in metres / metric tons.
export const ftToM = (ft: number) => Math.round(ft * 0.3048 * 100) / 100;
export const mToFt = (m: number) => Math.round((m / 0.3048) * 10) / 10;
export const lbToT = (lb: number) => Math.round(lb * 0.000453592 * 10) / 10;
export const tToLb = (t: number) => Math.round(t / 0.000453592 / 100) * 100;

const pad = (n: number) => String(n).padStart(2, "0");
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function incidentLabel(i: { type: string; delayMinutes: number | null }): string {
  switch (i.type) {
    case "delay":
      return i.delayMinutes ? `Delayed about ${i.delayMinutes} min` : "Delayed";
    case "breakdown":
      return "Bus breakdown";
    case "accident":
      return "Accident reported";
    case "off_route":
      return "Off route";
    case "stopped":
      return "Stopped for a while";
    default:
      return "Driver reported a problem";
  }
}

export function download(filename: string, content: string, type = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
