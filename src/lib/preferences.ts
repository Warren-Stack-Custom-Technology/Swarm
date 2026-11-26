import { reactive, watch } from "vue";
import {
  automaticTorrentShape,
  SWARM_SHAPES,
  torrentIdentityHash,
} from "./identity";
import type { TorrentShape } from "./identity";
export const palette = [
  "#32caff",
  "#ffcf32",
  "#ff5268",
  "#bb5cff",
  "#51ed6e",
  "#ff8a35",
  "#ff4cba",
  "#527dff",
];
const allocated = new Map<string, string>();
export function vividColor(color: string) {
  const channels = [1, 3, 5].map(
    (i) => parseInt(color.slice(i, i + 2), 16) / 255,
  );
  const low = Math.min(...channels),
    high = Math.max(...channels);
  if (!Number.isFinite(high)) return color;
  const range = high - low;
  if (range < 0.025) return "#dedee4";
  if (high >= 0.85 && range / high >= 0.6) return color;
  return (
    "#" +
    channels
      .map((value) =>
        Math.round((0.18 + ((value - low) / range) * 0.82) * 255)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}
function json<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null") ?? fallback;
  } catch {
    return fallback;
  }
}
export function legacyString(key: string, fallback = "") {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    try {
      const parsed = JSON.parse(raw);
      return typeof parsed === "string" ? parsed : raw;
    } catch {
      return raw;
    }
  } catch {
    return fallback;
  }
}
export const preferences = reactive({
  identities: json<Record<string, { color: string; shape: TorrentShape }>>(
    "swarm.identities",
    {},
  ),
  geoEnabled: json<boolean>("swarm.geo", json("swarm_geo_enabled", false)),
  originOverride: json<string>(
    "swarm.origin",
    legacyString("swarm_origin_ip", ""),
  ),
  mode: json<"globe" | "flat">(
    "swarm.mode",
    legacyString("swarm_map_mode", "globe") === "flat" ? "flat" : "globe",
  ),
  animate: json<boolean>("swarm.animate", json("swarm_animate", true)),
  showIdle: json<boolean>("swarm.idle", json("swarm_idle_routes", false)),
  view: json<"atlas" | "library">("swarm.view", "atlas"),
  markerSize: Math.max(
    5,
    Math.min(10, Number(json("swarm.markerSize", 8)) || 8),
  ),
  vivid: json<boolean>("swarm.vivid", true),
  uiScale: Math.max(0.9, Math.min(1.5, Number(json("swarm.uiScale", 1)) || 1)),
});
const oldColors = json<Record<string, string>>("swarm_torrent_colors", {}),
  oldShapes = json<Record<string, TorrentShape>>("swarm_torrent_shapes", {});
export function allocateIdentities(hashes: string[]) {
  const active = new Set(hashes);
  for (const hash of allocated.keys())
    if (!active.has(hash)) allocated.delete(hash);
  const counts = new Map<string, number>();
  for (const hash of hashes) {
    const color =
      preferences.identities[hash]?.color ??
      oldColors[hash] ??
      allocated.get(hash);
    if (color) counts.set(color, (counts.get(color) ?? 0) + 1);
  }
  for (const hash of [...hashes].sort()) {
    if (
      preferences.identities[hash]?.color ||
      oldColors[hash] ||
      allocated.has(hash)
    )
      continue;
    const offset = torrentIdentityHash(hash) % palette.length;
    const choices = [...palette.slice(offset), ...palette.slice(0, offset)];
    const color = choices.reduce((best, color) =>
      (counts.get(color) ?? 0) < (counts.get(best) ?? 0) ? color : best,
    );
    allocated.set(hash, color);
    counts.set(color, (counts.get(color) ?? 0) + 1);
  }
}
export function identity(hash: string) {
  const custom = preferences.identities[hash];
  const color =
    custom?.color ??
    oldColors[hash] ??
    allocated.get(hash) ??
    palette[torrentIdentityHash(hash) % palette.length];
  return {
    color: preferences.vivid ? vividColor(color) : color,
    shape: custom?.shape ?? oldShapes[hash] ?? automaticTorrentShape(hash),
  };
}
export function setIdentity(hash: string, color: string, shape: TorrentShape) {
  if (/^#[a-f0-9]{6}$/i.test(color) && SWARM_SHAPES.includes(shape))
    preferences.identities[hash] = { color, shape };
}
watch(
  preferences,
  () => {
    try {
      for (const [key, value] of Object.entries(preferences))
        localStorage.setItem(
          "swarm." +
            ((
              {
                geoEnabled: "geo",
                originOverride: "origin",
                showIdle: "idle",
              } as Record<string, string>
            )[key] ?? key),
          JSON.stringify(value),
        );
    } catch {
      /* private/storage-full browsers keep the current in-memory preferences */
    }
  },
  { deep: true },
);

watch(
  () => preferences.uiScale,
  (scale) => {
    document.documentElement.style.setProperty(
      "--ui-scale",
      String(Math.max(0.9, Math.min(1.5, scale))),
    );
  },
  { immediate: true },
);
