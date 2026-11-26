import { geoDistance, geoInterpolate, geoRotation } from "d3-geo";
import type { GeoLocation } from "../types";
import type { TorrentShape } from "./identity";

export interface MapConnection {
  id: string;
  torrentName: string;
  color: string;
  shape: TorrentShape;
  ip: string;
  port: number;
  seed: boolean;
  download: number;
  upload: number;
  location: GeoLocation;
}
export interface SwarmCamera {
  mode: "globe" | "flat";
  width: number;
  height: number;
  zoom: number;
  yaw: number;
  pitch: number;
  panX: number;
  panY: number;
}
export interface ScenePoint {
  x: number;
  y: number;
  visible: boolean;
}
export interface RoutePoint extends ScenePoint {
  t: number;
}
export interface SceneRoute {
  connection: MapConnection;
  points: RoutePoint[];
  shifts: number[];
  node: ScenePoint;
  clip?: { left: number; top: number; width: number; height: number };
}
const RAD = Math.PI / 180;

export function sceneScale(camera: SwarmCamera) {
  return camera.mode === "globe"
    ? Math.min(camera.width * 0.43, camera.height * 0.44) * camera.zoom
    : Math.min(
        (camera.width * 0.94) / (2 * Math.PI),
        (camera.height * 0.88) / Math.PI,
      ) * camera.zoom;
}

export function projectLocation(
  longitude: number,
  latitude: number,
  camera: SwarmCamera,
  elevation = 0,
): ScenePoint {
  const scale = sceneScale(camera);
  if (camera.mode === "flat")
    return {
      x: camera.width / 2 + camera.panX + longitude * RAD * scale,
      y:
        camera.height / 2 +
        camera.panY -
        latitude * RAD * scale -
        elevation * scale,
      visible: true,
    };
  const [lon, lat] = geoRotation([camera.yaw, camera.pitch])([
    longitude,
    latitude,
  ]).map((value) => value * RAD);
  const z = Math.cos(lat) * Math.cos(lon);
  return {
    x:
      camera.width / 2 +
      Math.cos(lat) * Math.sin(lon) * scale * (1 + elevation),
    y: camera.height / 2 - Math.sin(lat) * scale * (1 + elevation),
    visible: z >= 0.005,
  };
}

export function flatWorldBounds(camera: SwarmCamera) {
  const radius = sceneScale(camera);
  return {
    left: camera.width / 2 + camera.panX - radius * Math.PI,
    top: camera.height / 2 + camera.panY - (radius * Math.PI) / 2,
    width: radius * Math.PI * 2,
    height: radius * Math.PI,
  };
}

export function clampFlatPan(camera: SwarmCamera) {
  const bounds = flatWorldBounds({ ...camera, panX: 0, panY: 0 });
  const maxX = Math.max(0, (bounds.width - camera.width) / 2 + 18);
  const maxY = Math.max(0, (bounds.height - camera.height) / 2 + 18);
  return {
    x: Math.min(maxX, Math.max(-maxX, camera.panX)) || 0,
    y: Math.min(maxY, Math.max(-maxY, camera.panY)) || 0,
  };
}

export function zoomCameraAt(
  camera: SwarmCamera,
  amount: number,
  point = { x: camera.width / 2, y: camera.height / 2 },
) {
  const next = {
    ...camera,
    zoom: Math.min(4, Math.max(1, camera.zoom * amount)),
  };
  if (camera.mode === "flat") {
    const ratio = next.zoom / camera.zoom;
    next.panX =
      point.x -
      camera.width / 2 -
      (point.x - camera.width / 2 - camera.panX) * ratio;
    next.panY =
      point.y -
      camera.height / 2 -
      (point.y - camera.height / 2 - camera.panY) * ratio;
    const pan = clampFlatPan(next);
    next.panX = pan.x;
    next.panY = pan.y;
  }
  return next;
}

export function buildSceneRoute(
  connection: MapConnection,
  origin: GeoLocation,
  camera: SwarmCamera,
): SceneRoute {
  const start: [number, number] = [origin.longitude, origin.latitude];
  const end: [number, number] = [
    connection.location.longitude,
    connection.location.latitude,
  ];
  const points: RoutePoint[] = [];
  const source = projectLocation(...start, camera);
  const node = projectLocation(...end, camera);
  if (camera.mode === "flat") {
    const clip = flatWorldBounds(camera);
    let endX = node.x;
    while (endX - source.x > clip.width / 2) endX -= clip.width;
    while (source.x - endX > clip.width / 2) endX += clip.width;
    const lift = Math.min(
      65,
      Math.hypot(endX - source.x, node.y - source.y) * 0.16,
    );
    const cx = (source.x + endX) / 2;
    const cy = Math.max(clip.top + 5, Math.min(source.y, node.y) - lift);
    for (let i = 0; i <= 40; i++) {
      const t = i / 40,
        u = 1 - t;
      points.push({
        x: u * u * source.x + 2 * u * t * cx + t * t * endX,
        y: u * u * source.y + 2 * u * t * cy + t * t * node.y,
        visible: true,
        t,
      });
    }
    const min = Math.min(source.x, endX),
      max = Math.max(source.x, endX);
    const shifts = [-clip.width, 0, clip.width].filter(
      (shift) =>
        max + shift >= clip.left && min + shift <= clip.left + clip.width,
    );
    return { connection, points, node, shifts, clip };
  }
  const interpolate = geoInterpolate(start, end);
  const lift = Math.min(0.12, geoDistance(start, end) * 0.055);
  for (let index = 0; index <= 40; index++) {
    const t = index / 40;
    const [lon, lat] = interpolate(t);
    const point = projectLocation(
      lon,
      lat,
      camera,
      Math.sin(Math.PI * t) * lift,
    );
    // No orphaned arcs when the exit is behind the globe. Endpoints remain inspectable.
    points.push({ ...point, visible: source.visible && point.visible, t });
  }
  return { connection, points, shifts: [0], node };
}

export function peersNearPoint(
  routes: SceneRoute[],
  x: number,
  y: number,
  tolerance = 13,
) {
  return routes
    .filter(
      (route) =>
        route.node.visible &&
        Math.hypot(route.node.x - x, route.node.y - y) < tolerance,
    )
    .sort(
      (a, b) =>
        Math.hypot(a.node.x - x, a.node.y - y) -
        Math.hypot(b.node.x - x, b.node.y - y),
    )
    .map((route) => route.connection);
}

export function pointAlongRoute(
  points: RoutePoint[],
  t: number,
): ScenePoint | undefined {
  const index = Math.min(
    points.length - 2,
    Math.floor(t * (points.length - 1)),
  );
  const a = points[index];
  const b = points[index + 1];
  if (!a?.visible || !b?.visible) return;
  const mix = t * (points.length - 1) - index;
  return {
    x: a.x + (b.x - a.x) * mix,
    y: a.y + (b.y - a.y) * mix,
    visible: true,
  };
}

// Same monotonic visual scale for both directions. Finite at zero and bounded at high rates.
export function trafficVelocity(speed: number) {
  return speed > 0
    ? Math.min(0.5, 0.018 + Math.log2(1 + speed / 1024) * 0.027)
    : 0;
}

export function packetProgress(
  phase: number,
  elapsed: number,
  speed: number,
  direction: "download" | "upload",
) {
  const position = (((phase + elapsed * trafficVelocity(speed)) % 1) + 1) % 1;
  return direction === "download" ? 1 - position : position;
}
