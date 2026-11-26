import {
  geoEquirectangular,
  geoGraticule,
  geoOrthographic,
  geoPath,
} from "d3-geo";
import type { GeoPermissibleObjects } from "d3-geo";
import type { GeoLocation } from "../types";
import { drawTorrentShape, torrentIdentityHash } from "./identity";
import {
  buildSceneRoute,
  packetProgress,
  pointAlongRoute,
  projectLocation,
  sceneScale,
} from "./scene";
import type { MapConnection, SceneRoute, SwarmCamera } from "./scene";
import land from "../assets/land.json";

const packetSprites = new Map<string, OffscreenCanvas>();
function drawPacket(
  context: CanvasRenderingContext2D,
  route: SceneRoute,
  x: number,
  y: number,
  radius: number,
  scale: number,
) {
  if (typeof OffscreenCanvas === "undefined") {
    drawTorrentShape(context, route.connection.shape, x, y, radius);
    return;
  }
  const key = `${route.connection.shape}:${route.connection.color}:${radius}:${scale}`;
  let sprite = packetSprites.get(key);
  if (!sprite) {
    if (packetSprites.size >= 128)
      packetSprites.delete(packetSprites.keys().next().value!);
    const logicalSize = Math.ceil(radius * 2 + 6);
    sprite = new OffscreenCanvas(
      Math.ceil(logicalSize * scale),
      Math.ceil(logicalSize * scale),
    );
    const drawing = sprite.getContext("2d");
    if (!drawing) {
      drawTorrentShape(context, route.connection.shape, x, y, radius);
      return;
    }
    drawing.scale(scale, scale);
    drawing.fillStyle = route.connection.color;
    drawing.strokeStyle = "#080809";
    drawing.lineWidth = 1.1;
    drawTorrentShape(
      drawing,
      route.connection.shape,
      sprite.width / scale / 2,
      sprite.height / scale / 2,
      radius,
    );
    packetSprites.set(key, sprite);
  }
  context.drawImage(
    sprite,
    x - sprite.width / scale / 2,
    y - sprite.height / scale / 2,
    sprite.width / scale,
    sprite.height / scale,
  );
}

export function drawWorld(
  context: CanvasRenderingContext2D,
  camera: SwarmCamera,
) {
  const { width, height, mode } = camera;
  const radius = sceneScale(camera);
  context.clearRect(0, 0, width, height);
  context.fillStyle = "#080808";
  context.fillRect(0, 0, width, height);
  const projection =
    mode === "globe"
      ? geoOrthographic()
          .scale(radius)
          .translate([width / 2, height / 2])
          .rotate([camera.yaw, camera.pitch])
          .clipAngle(90)
      : geoEquirectangular()
          .scale(radius)
          .translate([width / 2 + camera.panX, height / 2 + camera.panY]);
  const path = geoPath(projection, context);
  if (mode === "globe") {
    context.fillStyle = "#050505";
    context.beginPath();
    context.ellipse(
      width / 2,
      height / 2 + radius * 0.96,
      radius * 0.65,
      radius * 0.065,
      0,
      0,
      Math.PI * 2,
    );
    context.fill();
    const ocean = context.createRadialGradient(
      width / 2 - radius * 0.4,
      height / 2 - radius * 0.45,
      radius * 0.05,
      width / 2,
      height / 2,
      radius,
    );
    ocean.addColorStop(0, "#343438");
    ocean.addColorStop(0.6, "#1e1e22");
    ocean.addColorStop(1, "#101013");
    context.beginPath();
    path({ type: "Sphere" });
    context.fillStyle = ocean;
    context.fill();
    context.strokeStyle = "#53535c";
    context.lineWidth = 1.3;
    context.stroke();
  }
  context.beginPath();
  path(land as GeoPermissibleObjects);
  context.fillStyle = "#44444a";
  context.fill();
  context.strokeStyle = "#707078";
  context.lineWidth = 0.7;
  context.stroke();
  context.beginPath();
  path(geoGraticule().step([30, 30])());
  context.strokeStyle = "#ffffff16";
  context.lineWidth = 0.65;
  context.stroke();
  if (mode === "globe") {
    const shading = context.createRadialGradient(
      width / 2 - radius * 0.34,
      height / 2 - radius * 0.35,
      radius * 0.2,
      width / 2,
      height / 2,
      radius,
    );
    shading.addColorStop(0, "#00000000");
    shading.addColorStop(0.6, "#0000000a");
    shading.addColorStop(1, "#000000b0");
    context.beginPath();
    path({ type: "Sphere" });
    context.fillStyle = shading;
    context.fill();
  }
}

export function makeRoutes(
  connections: MapConnection[],
  origin: GeoLocation | undefined,
  camera: SwarmCamera,
) {
  return origin
    ? connections.map((connection) =>
        buildSceneRoute(connection, origin, camera),
      )
    : [];
}

export function drawConnections(
  context: CanvasRenderingContext2D,
  routes: SceneRoute[],
  selectedId: string,
  showIdle = false,
  markerSize = 7,
) {
  const clip = routes[0]?.clip;
  if (clip) {
    context.save();
    context.beginPath();
    context.rect(clip.left, clip.top, clip.width, clip.height);
    context.clip();
  }
  for (const route of routes) {
    const active = route.connection.download > 0 || route.connection.upload > 0;
    if (!active && !showIdle && selectedId !== route.connection.id) continue;
    const emphasized = !selectedId || selectedId === route.connection.id;
    context.globalAlpha = emphasized ? (active ? 0.16 : 0.055) : 0.025;
    context.strokeStyle = route.connection.color;
    context.lineWidth = selectedId === route.connection.id ? 1.6 : 0.65;
    for (const shift of route.shifts) {
      context.beginPath();
      let started = false;
      for (const point of route.points) {
        if (!point.visible) {
          started = false;
          continue;
        }
        if (!started) context.moveTo(point.x + shift, point.y);
        else context.lineTo(point.x + shift, point.y);
        started = true;
      }
      context.stroke();
    }
  }
  context.globalAlpha = 1;
  // Constant pixel sizes regardless of zoom. Active traffic gets the visual emphasis.
  for (const route of routes) {
    if (!route.node.visible) continue;
    context.globalAlpha =
      selectedId && selectedId !== route.connection.id
        ? 0.45
        : route.connection.download > 0 || route.connection.upload > 0
          ? 0.9
          : 0.45;
    context.fillStyle = route.connection.color;
    context.strokeStyle = "#09090a";
    context.lineWidth = 1.2;
    drawTorrentShape(
      context,
      route.connection.shape,
      route.node.x,
      route.node.y,
      selectedId === route.connection.id ? markerSize + 1.5 : markerSize * 0.8,
    );
  }
  context.globalAlpha = 1;
  if (clip) context.restore();
}

export function drawPackets(
  context: CanvasRenderingContext2D,
  routes: SceneRoute[],
  elapsed: number,
  selectedId: string,
  budget = 900,
  phases?: Map<string, number>,
  markerSize = 7,
) {
  let drawn = 0;
  const clip = routes[0]?.clip;
  if (clip) {
    context.save();
    context.beginPath();
    context.rect(clip.left, clip.top, clip.width, clip.height);
    context.clip();
  }
  const scale = context.getTransform().a || 1;
  const width = context.canvas.width / scale;
  const height = context.canvas.height / scale;
  const active = routes.filter(
    (route) =>
      route.points[0]?.visible &&
      (route.connection.download > 0 || route.connection.upload > 0),
  );
  // Always include one marker for each visible active direction before adding repeats.
  const lanes = active.flatMap((route) =>
    (["download", "upload"] as const)
      .filter((direction) => route.connection[direction] > 0)
      .map((direction) => ({ route, direction })),
  );
  lanes.sort(
    (a, b) =>
      Number(b.route.connection.id === selectedId) -
      Number(a.route.connection.id === selectedId),
  );
  for (let repeat = 0; repeat < 3 && drawn < budget; repeat++) {
    for (const { route, direction } of lanes) {
      if (drawn >= budget) break;
      const speed = route.connection[direction];
      if (repeat > 0 && (active.length > 180 || speed < 32_768)) continue;
      const offset = (torrentIdentityHash(route.connection.id) % 997) / 997;
      const phase = phases?.get(`${route.connection.id}:${direction}`);
      const t = packetProgress(
        offset + repeat / 3 + (phase ?? 0),
        phases ? 0 : elapsed,
        speed,
        direction,
      );
      const point = pointAlongRoute(route.points, t);
      if (!point) continue;
      for (const shift of route.shifts) {
        if (drawn >= budget) break;
        if (
          point.x + shift < -8 ||
          point.x + shift > width + 8 ||
          point.y < -8 ||
          point.y > height + 8
        )
          continue;
        context.globalAlpha =
          selectedId && selectedId !== route.connection.id ? 0.4 : 1;
        context.fillStyle = route.connection.color;
        context.strokeStyle = "#080809";
        context.lineWidth = 1.1;
        // Parallel lanes separate two-way transfers without rotating the identity shape.
        drawPacket(
          context,
          route,
          point.x + shift,
          point.y +
            (direction === "download" ? -markerSize * 0.65 : markerSize * 0.65),
          selectedId === route.connection.id ? markerSize + 1.5 : markerSize,
          scale,
        );
        drawn++;
      }
    }
  }
  context.globalAlpha = 1;
  if (clip) context.restore();
  return drawn;
}

export function drawOrigin(
  context: CanvasRenderingContext2D,
  origin: GeoLocation | undefined,
  camera: SwarmCamera,
) {
  if (!origin) return;
  const point = projectLocation(origin.longitude, origin.latitude, camera);
  if (
    !point.visible ||
    point.x < 0 ||
    point.x > camera.width ||
    point.y < 0 ||
    point.y > camera.height
  )
    return;
  context.beginPath();
  context.arc(point.x, point.y, 10, 0, Math.PI * 2);
  context.fillStyle = "#ffffff20";
  context.fill();
  context.strokeStyle = "#f2f2f5";
  context.lineWidth = 1;
  context.stroke();
  context.beginPath();
  context.arc(point.x, point.y, 4.5, 0, Math.PI * 2);
  context.fillStyle = "#ffffff";
  context.fill();
  context.strokeStyle = "#09090a";
  context.lineWidth = 1.5;
  context.stroke();
  context.font = "600 14px sans-serif";
  const textX = Math.min(camera.width - 45, Math.max(8, point.x + 17));
  const textY = Math.max(17, point.y - 12);
  context.fillStyle = "#17171a";
  context.fillRect(textX - 4, textY - 15, 43, 21);
  context.fillStyle = "#ffffff";
  context.fillText("YOU", textX, textY);
}
