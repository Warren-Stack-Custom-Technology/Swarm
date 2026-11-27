import type { GeoLocation } from "../types";

type Vector = [number, number, number];
type Location = Pick<GeoLocation, "longitude" | "latitude">;
const radians = Math.PI / 180;
const dot = (a: Vector, b: Vector) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function normalize(v: Vector): Vector {
  const length = Math.hypot(...v);
  return length > 1e-10 ? v.map((n) => n / length) as Vector : [1, 0, 0];
}
function vector(location: Location): Vector {
  const lon = location.longitude * radians, lat = location.latitude * radians;
  return [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];
}

/** One-shot, bounded spherical search. Score every connection; never run during animation. */
export function bestGlobeView(
  locations: readonly Location[],
  exit: Location | undefined,
  current: { yaw: number; pitch: number },
): { yaw: number; pitch: number } {
  const valid = (p: Location) => Number.isFinite(p.longitude) && Number.isFinite(p.latitude) && Math.abs(p.latitude) <= 90;
  const groups = new Map<string, { point: Vector; weight: number }>();
  for (const location of locations) {
    if (!valid(location)) continue;
    const key = `${location.longitude},${location.latitude}`;
    const group = groups.get(key);
    if (group) group.weight++;
    else groups.set(key, { point: vector(location), weight: 1 });
  }
  if (!groups.size) return current;
  const points = [...groups.values()];
  const origin = exit && valid(exit) ? vector(exit) : undefined;
  let best = vector({ longitude: -current.yaw, latitude: -current.pitch });
  let count = -1, depth = -Infinity;
  const consider = (direction: Vector) => {
    // Match the renderer's horizon cut-off and retain the source of every route.
    if (origin && dot(direction, origin) < 0.006) return;
    let visible = 0, centered = 0;
    for (const { point, weight } of points) {
      const distance = dot(direction, point);
      if (distance >= 0.005) {
        visible += weight;
        centered += distance * weight;
      }
    }
    if (visible > count || (visible === count && centered > depth + 1e-9)) {
      best = direction;
      count = visible;
      depth = centered;
    }
  };
  consider(best);
  if (origin) consider(origin);
  const mean: Vector = [0, 0, 0];
  for (const { point, weight } of points)
    for (let axis = 0; axis < 3; axis++) mean[axis] += point[axis] * weight;
  if (Math.hypot(...mean) > 1e-10) consider(normalize(mean));
  // Evenly cover the whole sphere, including polar and date-line clusters.
  for (let index = 0; index < 768; index++) {
    const z = 1 - 2 * (index + 0.5) / 768;
    const radius = Math.sqrt(1 - z * z), angle = index * Math.PI * (3 - Math.sqrt(5));
    consider([radius * Math.cos(angle), radius * Math.sin(angle), z]);
  }
  // Data-derived seeds help small clusters that fall between the global samples.
  const step = Math.max(1, Math.ceil(points.length / 128));
  for (let index = 0; index < points.length; index += step) {
    const point = points[index].point;
    consider(point);
    if (origin) {
      const midpoint = point.map((n, axis) => n + origin[axis]) as Vector;
      if (Math.hypot(...midpoint) > 1e-10) consider(normalize(midpoint));
    }
  }
  // Refine around the winning hemisphere without allocating a new render loop.
  for (const degrees of [16, 8, 4, 2, 1, 0.5, 0.25, 0.1]) {
    for (let pass = 0; pass < 3; pass++) {
      const center = best;
      const east = normalize([-center[1], center[0], 0]);
      const north: Vector = [
        center[1] * east[2] - center[2] * east[1],
        center[2] * east[0] - center[0] * east[2],
        center[0] * east[1] - center[1] * east[0],
      ];
      const angle = degrees * radians;
      for (let index = 0; index < 8; index++) {
        const azimuth = index * Math.PI / 4;
        consider(center.map((n, axis) => n * Math.cos(angle) + Math.sin(angle) *
          (east[axis] * Math.cos(azimuth) + north[axis] * Math.sin(azimuth))) as Vector);
      }
      if (best === center) break;
    }
  }
  return {
    yaw: -Math.atan2(best[1], best[0]) / radians,
    pitch: -Math.asin(Math.max(-1, Math.min(1, best[2]))) / radians,
  };
}
