export interface SpeedSample { at: number; down: number; up: number }
export const HISTORY_WINDOW = 24 * 60 * 60 * 1000;
export const speedRanges = [
  { value: 0, label: "Session" },
  { value: 5 * 60, label: "5 minutes" },
  { value: 30 * 60, label: "30 minutes" },
  { value: 3600, label: "1 hour" },
  { value: 3 * 3600, label: "3 hours" },
  { value: 6 * 3600, label: "6 hours" },
  { value: 12 * 3600, label: "12 hours" },
  { value: 24 * 3600, label: "24 hours" },
];
export function recordSpeed(history: SpeedSample[], sample: SpeedSample) {
  if (history.length && sample.at - history[history.length - 1].at < 5000) return;
  history.push(sample);
  const cutoff = sample.at - HISTORY_WINDOW;
  const first = history.findIndex(point => point.at >= cutoff);
  if (first > 0) history.splice(0, first);
  if (history.length > 17281) history.splice(0, history.length - 17281);
}
export function chartData(history: SpeedSample[], seconds: number, now: number, down = true, up = true, width = 960) {
  const end = now;
  const start = seconds ? end - seconds * 1000 : Math.min(history[0]?.at ?? end, end - 60000);
  const samples = history.filter(point => point.at >= start && point.at <= end);
  const peak = Math.max(1024, ...samples.map(point => Math.max(down ? point.down : 0, up ? point.up : 0)));
  const scale = Math.pow(10, Math.floor(Math.log10(peak)));
  const maximum = Math.ceil(peak / scale) * scale;
  const x = (at: number) => 80 + (at - start) / Math.max(1, end - start) * (width - 100);
  const y = (value: number) => 185 - Math.max(0, value) / maximum * 160;
  function path(key: "down" | "up") {
    return samples.map((point, index) => `${!index || point.at - samples[index - 1].at > 15000 ? "M" : "L"}${x(point.at).toFixed(1)},${y(point[key]).toFixed(1)}`).join(" ");
  }
  return { samples, start, end, maximum, x, y, downloadPath: path("down"), uploadPath: path("up") };
}
