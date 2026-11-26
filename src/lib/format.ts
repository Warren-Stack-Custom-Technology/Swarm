export function bytes(value = 0) {
  if (!Number.isFinite(value) || value < 0) return "—";
  if (value < 1024) return `${Math.round(value)} B`;
  const units = ["KiB", "MiB", "GiB", "TiB"];
  let n = value / 1024,
    index = 0;
  while (n >= 1024 && index < 3) {
    n /= 1024;
    index++;
  }
  return `${n >= 100 ? n.toFixed(0) : n.toFixed(1)} ${units[index]}`;
}
export function speed(value = 0) {
  return bytes(value) + "/s";
}
export function percent(value = 0) {
  return (
    Math.min(100, Math.max(0, value * 100)).toFixed(
      value > 0 && value < 1 ? 1 : 0,
    ) + "%"
  );
}
export function duration(seconds = 0) {
  if (seconds < 0 || seconds >= 8640000 || !Number.isFinite(seconds))
    return "∞";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400)
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`;
}
export function stateLabel(state = "unknown") {
  const map: Record<string, string> = {
    uploading: "Uploading",
    stalledUP: "Seeding",
    forcedUP: "Forced upload",
    downloading: "Downloading",
    stalledDL: "Waiting for peers",
    forcedDL: "Forced download",
    checkingUP: "Checking files",
    checkingDL: "Checking files",
    checkingResumeData: "Checking resume data",
    pausedUP: "Stopped",
    pausedDL: "Stopped",
    stoppedUP: "Stopped",
    stoppedDL: "Stopped",
    queuedUP: "Queued upload",
    queuedDL: "Queued download",
    metaDL: "Getting metadata",
    forcedMetaDL: "Getting metadata",
    moving: "Moving files",
    error: "Error",
    missingFiles: "Missing files",
    allocating: "Allocating",
    unknown: "Unknown",
  };
  return map[state] ?? state;
}
export function stopped(state = "") {
  return /^(paused|stopped)/.test(state);
}
export function statusGroup(state = "") {
  if (/error|missing/i.test(state)) return "error";
  if (stopped(state)) return "stopped";
  if (/checking/.test(state)) return "checking";
  if (/UP|uploading/.test(state)) return "seeding";
  if (/DL|downloading|allocating/.test(state)) return "downloading";
  return "other";
}
